/**
 * 评分表状态机（主规格第 6.6 节与第 15 节 Phase 7）。
 *
 * 数据库枚举给了五个状态：
 *   `draft` → `submitted` → `reopened` → `resubmitted` → `published`
 *
 * 规范第 15 节 Phase 7 明文要求："**Reopen/resubmit/audit and publish workflow.**"
 * 也就是说"重开""重交""发布"是三个必须存在的动作，而且**都要被审计**。
 *
 * -----------------------------------------------------------------------------
 * 为什么单独一个纯函数模块
 *
 * 状态转换的规则写在三个地方会漂移：界面（显示哪些按钮）、
 * 服务端动作（允许哪些操作）、数据库（实际状态是什么）。
 * 因此把**唯一**的定义放在这里，其他地方引用它 ——
 * 与 `event-lifecycle.ts` 同一套做法（Phase 2 定的）。
 *
 * ⚠️ 规范没有画出一张精确的转换表，下面这些**是被规范文字隐含约束的**：
 *   - `draft` 只能由**裁判**提交（P7-4 已实现）；
 *   - `reopened` 只能由**管理员**触发（规范把它和"审计"并列）；
 *   - `resubmitted` 只能由裁判在**被重开之后**产生；
 *   - `published` 只能由管理员发布；
 *   - `published` **是终态** —— 规范没有给出"取消发布"的动作，
 *     因此我不擅自加一个。要改必须由管理员重开（那会被审计）。
 */

export const BALLOT_STATUSES = [
  "draft",
  "submitted",
  "reopened",
  "resubmitted",
  "published",
] as const;

export type BallotStatus = (typeof BALLOT_STATUSES)[number];

/** 谁能触发这次转换。 */
export type BallotActor = "judge" | "manager";

export type BallotTransition = {
  from: BallotStatus;
  to: BallotStatus;
  actor: BallotActor;
  /** 这个转换的中文说明，直接用于界面按钮与提示 */
  label: string;
};

/**
 * 全部合法的转换。
 *
 * ⚠️ 这是**唯一**的定义。新增转换必须同时改这里与数据库函数，
 * 而"两边是否一致"有一条测试直接比对迁移文件里的清单（见测试文件）。
 */
export const BALLOT_TRANSITIONS: readonly BallotTransition[] = [
  { from: "draft", to: "submitted", actor: "judge", label: "提交评分表" },
  { from: "reopened", to: "resubmitted", actor: "judge", label: "重新提交" },
  { from: "submitted", to: "reopened", actor: "manager", label: "重开（要求更正）" },
  { from: "resubmitted", to: "reopened", actor: "manager", label: "再次重开" },
  { from: "submitted", to: "published", actor: "manager", label: "发布" },
  { from: "resubmitted", to: "published", actor: "manager", label: "发布" },
] as const;

/** 找出一条转换；不存在则返回 null。 */
export function findBallotTransition(
  from: BallotStatus,
  to: BallotStatus,
  actor: BallotActor,
): BallotTransition | null {
  return (
    BALLOT_TRANSITIONS.find(
      (transition) =>
        transition.from === from && transition.to === to && transition.actor === actor,
    ) ?? null
  );
}

export type BallotTransitionCheck =
  { allowed: true; transition: BallotTransition } | { allowed: false; message: string };

/**
 * 判断一次状态转换是否允许，并给出**可直接显示**的中文原因。
 *
 * 不直接返回布尔值：界面需要告诉操作者"为什么不行" ——
 * 例如"这份评分表还没有提交，无法重开"比"操作失败"有用得多。
 */
export function checkBallotTransition(
  from: BallotStatus,
  to: BallotStatus,
  actor: BallotActor,
): BallotTransitionCheck {
  const transition = findBallotTransition(from, to, actor);
  if (transition) return { allowed: true, transition };

  // 同一个目标状态但角色不对 —— 这种情况要单独说，否则提示会误导
  const byOtherActor = BALLOT_TRANSITIONS.find(
    (candidate) => candidate.from === from && candidate.to === to,
  );
  if (byOtherActor) {
    return {
      allowed: false,
      message:
        byOtherActor.actor === "manager"
          ? "这个操作只有管理员可以做。"
          : "这个操作只有负责本场的裁判可以做。",
    };
  }

  // 状态本身不允许
  if (from === "published") {
    return {
      allowed: false,
      message: "这份评分表已经发布，不能直接修改。如需更正，请先重开（重开会记入审计日志）。",
    };
  }
  if (to === "reopened" && from === "draft") {
    return { allowed: false, message: "这份评分表还是草稿，裁判可以自己继续填，不需要重开。" };
  }
  if (to === "published" && from === "draft") {
    return { allowed: false, message: "这份评分表还没有提交，不能发布。" };
  }
  if (to === "published" && from === "reopened") {
    return {
      allowed: false,
      message: "这份评分表已被重开，正在等裁判重新提交，现在不能发布。",
    };
  }

  return { allowed: false, message: `不能从「${from}」变到「${to}」。` };
}

/**
 * 某个状态下，**这位操作者**可以做的动作。
 *
 * 界面用它决定显示哪些按钮 —— 但**权限的最终判定在服务端与数据库**，
 * 这里只是不让人看到按了会失败的按钮。
 */
export function availableBallotActions(
  status: BallotStatus,
  actor: BallotActor,
): BallotTransition[] {
  return BALLOT_TRANSITIONS.filter(
    (transition) => transition.from === status && transition.actor === actor,
  );
}

/** 状态的中文名称。 */
export const BALLOT_STATUS_TEXT: Record<BallotStatus, string> = {
  draft: "草稿",
  submitted: "已提交",
  reopened: "已重开（等裁判重新提交）",
  resubmitted: "已重新提交",
  published: "已发布",
};

/** 学生能不能看到这个状态的评分表（规范第 14.3 节：只有已发布能看）。 */
export function isBallotVisibleToStudents(status: BallotStatus): boolean {
  return status === "published";
}

/**
 * 是否已经"交上来了"（用于看板统计"裁判是否已交表"）。
 *
 * `reopened` **不算**已交 —— 那正是它存在的意义：管理员要求更正，
 * 而更正还没发生。把它算成已交会让看板显示"全部交齐"而实际还差一份。
 */
export function isBallotSubmittedForDashboard(status: BallotStatus): boolean {
  return status === "submitted" || status === "resubmitted" || status === "published";
}
