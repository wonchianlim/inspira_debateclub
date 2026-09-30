/**
 * 邮件投递的**重试与调度**逻辑（Phase 9 的 "Retry/observability"）。
 *
 * 主规格第 15 节 Phase 9 原文："**Retry/observability**, rate limits,
 * audit coverage review."
 *
 * -----------------------------------------------------------------------------
 * 为什么这部分值得单独一个纯函数模块
 *
 * "什么时候该再试一次"是**业务规则**，不是服务商的细节：
 *   - 试了几次还没成，就该放弃（否则队列会永远堆着永远发不出去的信）
 *   - 失败后**不能立刻重试**（对方可能正忙；立刻重试等于拿攻击行为对待自己的服务商）
 *   - 每次重试的间隔要**变长**（指数退避），否则一次服务商抖动会瞬间打出几百次请求
 *
 * 这些规则与"用哪家服务商"无关，因此**现在就能写完并测透**
 * —— 等接上腾讯云邮件推送时，只需要实现"真的发出这一封"这一步。
 */

/** 一封信在队列里的状态。 */
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

export type DeliveryRow = {
  id: string;
  status: DeliveryStatus;
  attempts: number;
  /** 计划发送时间（ISO） */
  scheduledAt: string;
};

/** 最多试几次。到顶之后标记为 `failed`，等人工处理，而不是永远重试。 */
export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * 指数退避的基数（分钟）。
 *
 * 第 1 次失败后等 2 分钟，第 2 次等 4 分钟，第 3 次等 8 分钟……
 * 取 2 而不是 1，是因为邮件服务商的限流窗口通常以分钟计 ——
 * 1 分钟的重试很容易再次撞上限流，白白消耗一次重试机会。
 *
 * ⚠️ 这是**我的选择**，腾讯云文档没有规定。写在常量里便于调整。
 */
export const RETRY_BASE_MINUTES = 2;

/**
 * 退避上限（分钟）。
 *
 * 不设上限的话，第 5 次重试要等 32 分钟 —— 一封"评分表已发布"的通知
 * 晚半小时才到，学生已经看完了。封顶 15 分钟，让最后一两次重试仍然及时。
 */
export const RETRY_MAX_MINUTES = 15;

/**
 * 第 `attempts` 次失败之后应该等多少分钟。
 *
 * `attempts = 0` 表示还没试过，返回 0（立刻可发）。
 */
export function retryDelayMinutes(attempts: number): number {
  if (attempts <= 0) return 0;
  const raw = RETRY_BASE_MINUTES * 2 ** (attempts - 1);
  return Math.min(raw, RETRY_MAX_MINUTES);
}

export type DeliveryDecision =
  | { action: "send" }
  | { action: "wait"; until: string; reason: string }
  | { action: "give_up"; reason: string };

/**
 * 这一封现在该不该发。
 *
 * @param row 队列里的一行
 * @param now 当前时间（注入以便测试）
 */
export function decideDelivery(row: DeliveryRow, now: Date = new Date()): DeliveryDecision {
  // 已经发出去或已取消的，不再处理
  if (row.status === "sent" || row.status === "cancelled") {
    return { action: "give_up", reason: `状态是「${row.status}」，不需要处理。` };
  }

  /*
   * ⚠️ 到顶之后**放弃**，而不是继续重试。
   *
   * "永远重试"看起来更努力，实际后果是队列里堆着一批发不出去的信，
   * 而管理员在界面上看到的是"还在尝试"—— 那会掩盖真正的问题。
   * 标记为 failed 之后，失败原因会显示在队列页面上，**人才能介入**。
   */
  if (row.attempts >= MAX_DELIVERY_ATTEMPTS) {
    return {
      action: "give_up",
      reason: `已经尝试 ${row.attempts} 次仍未成功，交给人工处理。`,
    };
  }

  const scheduled = new Date(row.scheduledAt).getTime();
  if (Number.isNaN(scheduled)) {
    // 时间戳坏了 —— 不能"当作现在"悄悄发出去，那会掩盖数据问题
    return { action: "give_up", reason: "计划发送时间不是合法时间，无法判断何时该发。" };
  }

  if (now.getTime() < scheduled) {
    return {
      action: "wait",
      until: row.scheduledAt,
      reason: "还没到计划发送时间。",
    };
  }

  return { action: "send" };
}

/**
 * 从一批队列行里挑出**现在可以发**的，按计划时间从早到晚。
 *
 * 返回顺序很重要：早该发的先发，否则一封积压的旧通知会排在
 * 刚产生的紧急通知后面。
 */
export function selectDueForDelivery(
  rows: readonly DeliveryRow[],
  now: Date = new Date(),
): DeliveryRow[] {
  return rows
    .filter((row) => decideDelivery(row, now).action === "send")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/**
 * 一封发出去了。
 *
 * 纯函数：返回**该写进数据库的字段**，由调用方去写。
 * 这样"发成功之后状态该变成什么"是可测的，而不是埋在 IO 代码里。
 */
export function onDeliverySucceeded(): {
  status: DeliveryStatus;
  sentAt: string;
  lastError: null;
} {
  return { status: "sent", sentAt: new Date().toISOString(), lastError: null };
}

/**
 * 一封发出失败了。
 *
 * ⚠️ 两种情况要分开：
 *   - 还能再试 → `pending`，并算出**下次该在什么时候**试
 *   - 已经到顶 → `failed`，并**必须带上原因**（数据库的 check 约束要求）
 *
 * 第一版很容易写成"失败就 failed"，那样重试永远不会发生 ——
 * 而"重试"正是规范这一节要求的东西。
 */
export function onDeliveryFailed(
  attempts: number,
  errorMessage: string,
  now: Date = new Date(),
): { status: DeliveryStatus; attempts: number; lastError: string; scheduledAt: string } {
  const nextAttempts = attempts + 1;

  if (nextAttempts >= MAX_DELIVERY_ATTEMPTS) {
    return {
      status: "failed",
      attempts: nextAttempts,
      // 失败原因一定要留下 —— 没有它，管理员看得到问题却无从下手
      lastError: errorMessage,
      scheduledAt: now.toISOString(),
    };
  }

  const delayMinutes = retryDelayMinutes(nextAttempts);
  return {
    status: "pending",
    attempts: nextAttempts,
    lastError: errorMessage,
    scheduledAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
  };
}
