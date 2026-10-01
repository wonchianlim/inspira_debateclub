/**
 * 学生报名的领域规则（纯逻辑）。
 *
 * ⚠️ 这里的每一条都必须与**数据库里的判断完全一致**，否则会出现
 * "界面说可以报名、数据库却拒绝"（用户看到一句英文错误）或者反过来的情况
 * （界面挡住、数据库其实允许）。数据库里的依据是：
 *
 *   `is_event_registration_open(event)`：
 *       status not in ('draft','cancelled','archived','completed')
 *       and now() >= registration_opens_at
 *       and now() < registration_closes_at
 *
 *   `registrations` 的 INSERT 策略：
 *       student_id = my_student_id() and is_event_registration_open(event_id)
 *
 *   `is_format_selectable_for_registration(registration, format)`：
 *       活动启用了该赛制（event_formats.enabled）
 *       and 学生在该赛制上合格（student_format_profiles.eligible）
 *
 * 规范第 9.2 节第 6 条特别强调："报名按时间戳自动关闭，即使定时的状态更新没有跑"。
 * 因此**时间戳才是真正的闸门**，活动状态只是一道粗筛 —— 本模块保持同样的性质。
 */

import type { EventStatus } from "@/lib/domain/event-lifecycle";

/**
 * 允许报名的活动状态。
 *
 * 刻意写成"排除法"以与数据库的 `not in (...)` 完全对应，而不是列举允许项 ——
 * 列举法在将来新增状态时会**静默多允许**一种状态，而排除法只会少允许，
 * 属于更安全的一侧。
 */
export const EVENT_STATUSES_BLOCKING_REGISTRATION: readonly EventStatus[] = [
  "draft",
  "cancelled",
  "archived",
  "completed",
];

export function isEventStatusOpenForRegistration(status: EventStatus): boolean {
  return !EVENT_STATUSES_BLOCKING_REGISTRATION.includes(status);
}

/** 报名窗口的细分状态。比数据库的布尔值更细，便于界面给出准确的解释。 */
export type RegistrationWindowState =
  /** 活动本身不可报名（草稿/已取消/已归档/已完成） */
  | "event_not_available"
  /** 还没到开放时间 */
  | "not_open_yet"
  /** 开放中 */
  | "open"
  /** 已过截止时间 */
  | "closed";

export type RegistrationWindowInput = {
  eventStatus: EventStatus;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  now: Date;
};

/**
 * 判断报名窗口状态。
 *
 * 边界与数据库一致：
 *   - `now` **恰好等于**开放时刻 → 开放（数据库是 `now() >= opens_at`）
 *   - `now` **恰好等于**截止时刻 → 已关闭（数据库是 `now() < closes_at`）
 * 这两个"等于"的方向很容易写反，因此有专门的边界测试。
 */
export function registrationWindowState(input: RegistrationWindowInput): RegistrationWindowState {
  if (!isEventStatusOpenForRegistration(input.eventStatus)) return "event_not_available";
  if (input.now.getTime() < input.registrationOpensAt.getTime()) return "not_open_yet";
  if (input.now.getTime() >= input.registrationClosesAt.getTime()) return "closed";
  return "open";
}

export type RegistrationBlockCode =
  | RegistrationWindowState
  /** 已经报过名了（同一活动一人一次） */
  | "already_registered";

export type RegistrationCheck =
  { allowed: true } | { allowed: false; code: RegistrationBlockCode; message: string };

export const REGISTRATION_WINDOW_MESSAGES: Record<RegistrationWindowState, string> = {
  event_not_available: "这个活动当前不接受报名。",
  not_open_yet: "报名还没有开放。",
  open: "",
  closed: "报名已经截止。",
};

/**
 * 判断某位学生现在能不能报名。
 *
 * @param existingRegistrationStatus 已经存在的报名状态；`null` 表示从未报名。
 *        规范第 9.2 节第 3 条是"学生**报名一次**"，且 `registrations` 有
 *        `UNIQUE (event_id, student_id)`，因此已有一行时不能再插一行。
 *        但 `cancelled` / `late_cancelled` 的行**可以改回** `registered`
 *        （Phase 0 的 SCHEMA-D-1 决定：取消后重新报名采用状态回退，不新增第二行）。
 */
export function checkRegistration(input: {
  window: RegistrationWindowInput;
  existingRegistrationStatus:
    "registered" | "cancelled" | "late_cancelled" | "checked_in" | "no_show" | null;
}): RegistrationCheck {
  const state = registrationWindowState(input.window);

  if (state !== "open") {
    return { allowed: false, code: state, message: REGISTRATION_WINDOW_MESSAGES[state] };
  }

  // `checked_in` / `no_show` 说明这个人已经到场过，重新报名没有意义
  if (
    input.existingRegistrationStatus === "registered" ||
    input.existingRegistrationStatus === "checked_in"
  ) {
    return { allowed: false, code: "already_registered", message: "你已经报名了这个活动。" };
  }
  if (input.existingRegistrationStatus === "no_show") {
    return {
      allowed: false,
      code: "already_registered",
      message: "这个活动已经标记你未到场，如需重新参加请联系管理员。",
    };
  }

  // cancelled / late_cancelled / null → 允许（前者是"撤回后重新报名"）
  return { allowed: true };
}

/**
 * 取消报名应记为哪种状态。
 *
 * 规范第 9.2 节第 5 条：
 *   "Before the deadline, cancellation becomes `cancelled`;
 *    after it, `late_cancelled`."
 *
 * 边界：`now` 恰好等于截止时刻 → 视为**迟取消**（与数据库"截止即关闭"的方向一致）。
 */
export function cancellationStatus(
  registrationClosesAt: Date,
  now: Date,
): "cancelled" | "late_cancelled" {
  return now.getTime() >= registrationClosesAt.getTime() ? "late_cancelled" : "cancelled";
}

// -----------------------------------------------------------------------------
// 赛制偏好
// -----------------------------------------------------------------------------

export type FormatChoiceInput = {
  formatId: string;
  /** 活动是否启用了该赛制 */
  eventFormatEnabled: boolean;
  /** 学生在该赛制上是否合格 */
  studentEligible: boolean;
};

export type BlockedFormatChoice = {
  formatId: string;
  reason: "format_not_enabled" | "student_not_eligible";
  message: string;
};

export type PartitionedFormatChoices = {
  /** 学生**可以**选的赛制 */
  selectable: string[];
  /** 不能选的赛制及原因 —— 界面要把原因显示出来，否则学生不知道该怎么办 */
  blocked: BlockedFormatChoice[];
};

/**
 * 把活动的赛制分成"可选"与"不可选"。
 *
 * 与数据库的 `is_format_selectable_for_registration` 一致：必须**同时**满足
 * "活动启用了"与"学生合格"。两个条件缺一不可。
 *
 * 为什么要把"不可选"也返回而不是直接丢掉：学生看到一个赛制不见了会困惑，
 * 显示"你没通过 WSDC 的资格"才是可行动的信息。
 */
export function partitionFormatChoices(
  choices: readonly FormatChoiceInput[],
): PartitionedFormatChoices {
  const selectable: string[] = [];
  const blocked: BlockedFormatChoice[] = [];

  for (const choice of choices) {
    if (!choice.eventFormatEnabled) {
      blocked.push({
        formatId: choice.formatId,
        reason: "format_not_enabled",
        message: "本次活动没有开设这个赛制。",
      });
      continue;
    }
    if (!choice.studentEligible) {
      blocked.push({
        formatId: choice.formatId,
        reason: "student_not_eligible",
        message: "你还没有获得这个赛制的资格，请联系管理员。",
      });
      continue;
    }
    selectable.push(choice.formatId);
  }

  return { selectable, blocked };
}

/**
 * 校验偏好排序。
 *
 * 规则：名次必须是从 1 开始的连续整数，且不能重复。
 * 数据库对 `(registration_id, preference_rank)` 有唯一约束，
 * 因此重复名次会被拒绝 —— 这里提前拦下并给出中文提示。
 */
export function validatePreferenceRanks(
  ranks: readonly number[],
):
  | { valid: true }
  | { valid: false; reason: "duplicate" | "not_positive" | "not_contiguous"; message: string } {
  if (ranks.some((rank) => !Number.isInteger(rank) || rank < 1)) {
    return { valid: false, reason: "not_positive", message: "偏好名次必须是从 1 开始的整数。" };
  }

  if (new Set(ranks).size !== ranks.length) {
    return { valid: false, reason: "duplicate", message: "不能给两个赛制填同一个名次。" };
  }

  const sorted = [...ranks].sort((a, b) => a - b);
  const contiguous = sorted.every((rank, index) => rank === index + 1);
  if (!contiguous) {
    return {
      valid: false,
      reason: "not_contiguous",
      message: "偏好名次必须是连续的（例如 1、2、3），不能跳号。",
    };
  }

  return { valid: true };
}

/* ---------------------------------------------------------------- 签到窗口 */

/**
 * 签到是否已经开放。
 *
 * ⚠️ 传入的必须是 `events.check_in_opens_at` —— **这次活动自己的**签到开放时刻，
 * 而不是"活动开始前 30 分钟"那个默认值。管理员可以在系统设置里改掉默认值，
 * 也可以单独调整某一次活动；两者之后就不相等了。
 * （`lib/domain/live-status.ts` 里原来的 `isCheckInOpen(startsAt, now)` 就是
 * 按写死的 30 分钟算的，因此已在 2026-10-01 删除。）
 *
 * ⚠️ 边界是**包含**的：`now` 恰好等于开放时刻时算已开放。
 * 这一条与数据库触发器 `enforce_check_in_window` 的 `<` 判断严格互补：
 * 数据库在 `now() < opens_at` 时拒绝，因此两边在边界上不会打架。
 *
 * 三处调用（现场看板、学生签到、学生活动详情页）都用这一个函数，
 * 不再各自写一遍比较 —— 否则边界迟早会有一处写成 `>`。
 */
export function isCheckInOpen(checkInOpensAt: Date, now: Date): boolean {
  return now.getTime() >= checkInOpensAt.getTime();
}
