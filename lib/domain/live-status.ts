/**
 * 现场状态（主规格第 2.8 节「Check-in and room state」）。
 *
 * 规范原文：
 *
 *   Check-in opens **30 minutes before** the event. Students use a simple
 *   **Check In** action; staff can check them in manually. At the **warning time**
 *   (normally 7:20 PM), missing participants or judges are flagged. At **start
 *   time**, unresolved rooms become **critical**.
 *
 *   Operational colors are **presentation only**; the database stores semantic states:
 *     - neutral:  scheduled, before warning;
 *     - warning:  someone missing after warning time;
 *     - ready:    all required participants and a judge are present;
 *     - live:     judge selected **Start Debate**;
 *     - complete: ballot submitted/published;
 *     - cancelled: match cancelled.
 *
 * ⚠️ **颜色只是展示层，数据库里存的是语义状态。** 因此本模块输出的是
 * `neutral / warning / ready / live / complete / cancelled` 这六个语义值，
 * 而不是任何颜色或样式类名 —— 界面自己决定怎么把它们画出来。
 *
 * ⚠️ 规范第 17 节还有一条相关要求：
 *   "Compute late cancellation, warning, and overdue behavior from **timestamps**,
 *    not browser-local assumptions."
 * 因此本模块**只接受时间戳**，不读浏览器时区，也不调用 `new Date()` 取"现在" ——
 * "现在"必须由调用方传入，测试才能覆盖边界。
 */

/** 数据库里存的语义状态。 */
export const LIVE_STATES = [
  "neutral",
  "warning",
  "ready",
  "live",
  "complete",
  "cancelled",
] as const;

export type LiveState = (typeof LIVE_STATES)[number];

/*
 * ⚠️ 这里原来还有一个 `CHECK_IN_OPENS_MINUTES_BEFORE = 30`，已删除。
 *
 * 「签到提前 30 分钟」是规范第 9.4 节给出的**默认值**，而它现在只有一个权威位置：
 * `lib/domain/event-schedule.ts` 的 `DEFAULT_SCHEDULE_OFFSETS.checkInOpensMinutesBefore`
 * （可被系统设置覆盖）。签到是否开放一律读 `events.check_in_opens_at` 那一列。
 * 留着第二个常量，就会出现"两个地方都说是 30 分钟，但都能各自被改"的局面。
 */

export type LiveStatusInput = {
  /** `matches.status` */
  matchStatus: string;
  /** 比赛计划开始时间 */
  scheduledStart: Date;
  /** 活动的警告时刻（`events.warning_at`） */
  warningAt: Date;
  /** 调用方传入的"现在" —— 本模块不自己取时间，便于测试边界 */
  now: Date;
  /** 这场比赛需要到场的学生总数 */
  requiredParticipantCount: number;
  /** 其中已签到的人数 */
  presentParticipantCount: number;
  /** 需要到场的裁判数（赛事配置决定，当前通常为 1） */
  requiredJudgeCount: number;
  /** 其中已签到的裁判数 */
  presentJudgeCount: number;
  /** 评分表是否已提交 */
  ballotSubmitted: boolean;
  /** 是否已发布 */
  published: boolean;
};

export type LiveStatusResult = {
  state: LiveState;
  /** 目前还缺什么（中文，可直接显示给管理员） */
  missing: string[];
  /**
   * 是否已经超过计划开始时间却还没开始。
   * 规范第 2.8 节："At start time, unresolved rooms become **critical**."
   */
  overdue: boolean;
  /** 距离警告时刻 / 开始时刻还有多少分钟（负数表示已过） */
  minutesUntilWarning: number;
  minutesUntilStart: number;
};

/**
 * 比赛是否已经"到了该开始的时间却还没开始"。
 *
 * 单独导出便于界面与测试直接使用，也便于将来加"超时多久算严重"的分级。
 */
export function isOverdue(scheduledStart: Date, now: Date, matchStatus: string): boolean {
  if (
    matchStatus === "started" ||
    matchStatus === "ballot_submitted" ||
    matchStatus === "published"
  ) {
    return false;
  }
  if (matchStatus === "cancelled") return false;
  return now.getTime() >= scheduledStart.getTime();
}

/** 计算一场比赛的现场状态。纯函数：相同输入必有相同输出。 */
export function computeLiveStatus(input: LiveStatusInput): LiveStatusResult {
  const missing: string[] = [];
  const missingParticipants = Math.max(
    0,
    input.requiredParticipantCount - input.presentParticipantCount,
  );
  const missingJudges = Math.max(0, input.requiredJudgeCount - input.presentJudgeCount);

  if (missingParticipants > 0) missing.push(`${missingParticipants} 位学生未签到`);
  if (missingJudges > 0) missing.push(`${missingJudges} 位裁判未签到`);

  const minutesUntilWarning = Math.round(
    (input.warningAt.getTime() - input.now.getTime()) / 60_000,
  );
  const minutesUntilStart = Math.round(
    (input.scheduledStart.getTime() - input.now.getTime()) / 60_000,
  );

  const overdue = isOverdue(input.scheduledStart, input.now, input.matchStatus);

  /*
   * 判定顺序很重要，按规范列出的优先级从"终态"往"起始态"走：
   * 已取消 / 已完成 / 进行中的比赛，不该因为"有人没签到"而被标成 warning。
   */
  let state: LiveState;

  if (input.matchStatus === "cancelled") {
    state = "cancelled";
  } else if (input.published || input.ballotSubmitted || input.matchStatus === "published") {
    state = "complete";
  } else if (input.matchStatus === "started") {
    state = "live";
  } else if (missing.length === 0) {
    /*
     * 规范："ready: all required participants **and a judge** are present."
     *
     * ⚠️ 裁判是**必要条件** —— 学生全到了但裁判没到，不叫 ready。
     * 这正是上面把 missingJudges 也算进 missing 的原因。
     */
    state = "ready";
  } else if (input.now.getTime() >= input.warningAt.getTime()) {
    state = "warning";
  } else {
    // 警告时刻之前，即使有人没签到也只是 neutral
    state = "neutral";
  }

  return { state, missing, overdue, minutesUntilWarning, minutesUntilStart };
}

/**
 * ⚠️ 这里**原来有一个** `isCheckInOpen(eventStartsAt, now)`，用
 * `CHECK_IN_OPENS_MINUTES_BEFORE`（写死 30 分钟）算"签到是否开放"。
 * 它已经被删除，因为它是**错的**：
 *
 * 「30 分钟」只是**新建活动时的默认值**，管理员可以在系统设置里改掉它。
 * 这次活动真正的签到开放时刻是 `events.check_in_opens_at` 那一列
 * （创建时按设置算好写进去，之后还能单独调整）。
 * 两者在管理员改过设置之后就不相等了 —— 于是现场看板会显示"签到已开放"，
 * 而数据库（`enforce_check_in_window`，2026-10-01）会拒绝学生的签到。
 *
 * 现在所有"签到开放了吗"的判断都读那一列，不再有第二份规则：
 *   - 现场看板：`lib/admin/live.ts` 的 `checkInOpen`
 *   - 学生签到：`lib/admin/check-in-actions.ts`
 *   - 学生活动详情页：`app/(app)/student/events/[eventId]/page.tsx`
 */

/** 汇总看板的计数。 */
export type LiveCounts = {
  total: number;
  neutral: number;
  warning: number;
  ready: number;
  live: number;
  complete: number;
  cancelled: number;
  /** 已过计划开始时间却还没开始的比赛数 */
  overdue: number;
};

/** 统计各状态的场数（用于看板顶部的汇总数字）。 */
export function summarizeLiveCounts(results: readonly LiveStatusResult[]): LiveCounts {
  const counts: LiveCounts = {
    total: results.length,
    neutral: 0,
    warning: 0,
    ready: 0,
    live: 0,
    complete: 0,
    cancelled: 0,
    overdue: 0,
  };
  for (const result of results) {
    counts[result.state] += 1;
    if (result.overdue) counts.overdue += 1;
  }
  return counts;
}

/** 状态的中文名称（展示层用，语义值仍是上面那六个）。 */
export const LIVE_STATE_LABELS: Record<LiveState, string> = {
  neutral: "未到警告时间",
  warning: "有缺人",
  ready: "已就绪",
  live: "进行中",
  complete: "已完成",
  cancelled: "已取消",
};

/**
 * 状态对管理员的**紧急程度**。
 *
 * 规范说颜色只是展示层 —— 这个函数同样是展示层的一部分：
 * 它把语义状态映射成"要不要立刻处理"，而**不**映射成具体颜色。
 */
export function liveStateUrgency(state: LiveState): "none" | "attention" | "act-now" {
  switch (state) {
    case "warning":
      return "act-now";
    case "ready":
      return "attention";
    case "neutral":
    case "live":
    case "complete":
    case "cancelled":
      return "none";
  }
}
