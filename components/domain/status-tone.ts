import type { StatusTone } from "@/components/domain/status-badge";
import type { BallotStatus } from "@/lib/domain/ballot-lifecycle";
import type { EventStatus } from "@/lib/domain/event-lifecycle";
import type { JudgeApprovalStatus } from "@/lib/domain/judge-eligibility";
import type { LiveState } from "@/lib/domain/live-status";
import type { RegistrationWindowState } from "@/lib/domain/registration";
import type { ProfileStatus } from "@/lib/validation/admin";
import type { PAIRING_PROPOSAL_STATUS_LABELS } from "@/lib/validation/pairing";
import type { RegistrationStatus } from "@/lib/validation/registrations";

/**
 * 业务状态 → 语气（颜色）的**唯一映射表**。
 *
 * ⚠️ 为什么要有这个文件：
 *
 * 在阶段 3b 之前，每个页面自己写 `variant={条件 ? "a" : "b"}` ——
 * 于是同一个"已发布"在三个页面可以是灰、蓝、绿三种颜色。
 * 只把 `<Badge>` 换成 `<StatusBadge>` 并不能解决它：
 * 那只是把"调用方挑颜色"从 `<Badge>` 搬到了 `tone={...}`。
 *
 * 真正的修法是规范 §1.2 目标 6 那句话：
 *   "Standardise status, terminology, interaction patterns … across the product."
 * 即：**同一个业务状态，全站只有一种颜色**，而且这个决定只写一次。
 *
 * 依据是规范 §13.4 那张 Status chips 表（七个家族），
 * 以及规范 §9.2「报名截止前取消记 cancelled，截止后记 late_cancelled」这类领域规则。
 *
 * 约定：每个映射都在注释里写出**为什么**是这个语气。没有理由的颜色就是装饰，
 * 而规范 §5.2 明确禁止"用语义色做装饰"。
 *
 * 未知值一律退化成 `neutral`（灰）—— 万一数据库多了个枚举值，
 * 界面应当显示成"普通、待确认"，而不是随便染成红或绿误导人。
 */

/* ------------------------------------------------------------------ 活动 */

const EVENT_STATUS_TONES: Record<EventStatus, StatusTone> = {
  draft: "neutral", // Neutral: Draft
  registration_open: "attention", // Attention: Registration open
  registration_closed: "neutral", // 报名截止既不是错误也不是成功，是"等下一步"
  pairing: "info", // Information: Pairing released
  ready: "info", // 配对已放出、可以开打
  live: "active", // Active: In progress / Live（深蓝，不是绿色）
  completed: "success", // Success: Complete
  archived: "neutral", // Neutral: Archived
  cancelled: "danger", // Error: Cancelled
};

/** 活动生命周期状态的语气。 */
export function eventStatusTone(status: EventStatus): StatusTone {
  return EVENT_STATUS_TONES[status] ?? "neutral";
}

/* ------------------------------------------------------------ 报名窗口 */

const REGISTRATION_WINDOW_TONES: Record<RegistrationWindowState, StatusTone> = {
  open: "attention", // Attention: Registration open —— 现在可以做事了
  not_open_yet: "neutral", // Neutral: Not started
  closed: "neutral", // 截止是正常流程，不是错误
  event_not_available: "neutral",
};

/** 报名窗口当前处于哪一段的语气。 */
export function registrationWindowTone(state: RegistrationWindowState): StatusTone {
  return REGISTRATION_WINDOW_TONES[state] ?? "neutral";
}

/* ------------------------------------------------------------ 报名状态 */

const REGISTRATION_STATUS_TONES: Record<RegistrationStatus, StatusTone> = {
  registered: "success", // Success: Registered
  checked_in: "success", // Success: Checked in
  /**
   * ⚠️ 截止前自行取消**是允许且无惩罚**的（规范 §9.2 为它单独定义了 cancelled）。
   * 规范 §13.4 里 Error 家族的 "Cancelled" 指的是**活动被取消**那种坏消息，
   * 不是"学生按规则退出了"。染成红色等于在骂一个完全合规的操作。
   */
  cancelled: "neutral",
  /** 截止后才取消会影响历史记录 —— 这是提醒，不是错误。 */
  late_cancelled: "warning",
  no_show: "danger", // 报了名却没到场，是真实的负面记录
};

/** 报名记录状态的语气。 */
export function registrationStatusTone(status: RegistrationStatus): StatusTone {
  return REGISTRATION_STATUS_TONES[status] ?? "neutral";
}

/* ------------------------------------------------------------ 账号状态 */

const PROFILE_STATUS_TONES: Record<ProfileStatus, StatusTone> = {
  active: "success", // 可以正常使用
  /**
   * ⚠️ 这里刻意与"已暂停"分开。迁移前两者都是红色，
   * 于是"毕业了"和"因违规被停"看起来一模一样。
   * 毕业/退社是**正常结束**，属于 Neutral: Archived。
   */
  inactive: "neutral",
  suspended: "danger", // 违规停用，是真的坏消息
};

/** 账号状态的语气。 */
export function profileStatusTone(status: ProfileStatus): StatusTone {
  return PROFILE_STATUS_TONES[status] ?? "neutral";
}

/* ------------------------------------------------------------ 裁判审批 */

const JUDGE_APPROVAL_TONES: Record<JudgeApprovalStatus, StatusTone> = {
  pending: "warning", // Pending: Awaiting approval —— 等管理员处理
  approved: "success", // Success: Approved
  rejected: "danger", // Error: Declined
  suspended: "danger", // 暂停使用，不能被指派
};

/** 裁判审批状态的语气。 */
export function judgeApprovalTone(status: JudgeApprovalStatus): StatusTone {
  return JUDGE_APPROVAL_TONES[status] ?? "neutral";
}

/* -------------------------------------------------------------- 评分表 */

const BALLOT_STATUS_TONES: Record<BallotStatus, StatusTone> = {
  draft: "neutral", // Neutral: Draft
  submitted: "success", // Success: Submitted
  reopened: "warning", // Pending: 已要求更正，等裁判重新提交
  resubmitted: "success", // Success: Submitted
  published: "info", // Information: Published（不是绿色 —— 发布是"可看"，不是"成功"）
};

/** 评分表状态的语气。 */
export function ballotStatusTone(status: BallotStatus): StatusTone {
  return BALLOT_STATUS_TONES[status] ?? "neutral";
}

/* ---------------------------------------------------------------- 比赛 */

/**
 * ⚠️ 这里用 `string` 而不是联合类型：管理端的 `listEventMatches` 目前把
 * `status` 暴露成 `string`（见 `lib/admin/matches.ts`）。收紧它要改数据层，
 * 不在阶段 3b 范围内。因此与其它映射不同，这个函数**必须**有兜底分支。
 */
const MATCH_STATUS_TONES: Record<string, StatusTone> = {
  scheduled: "warning", // Pending: Scheduled
  missing_participant: "danger", // Error: 缺人，开不了
  ready: "info", // Information: 可以开始
  started: "active", // Active: In progress
  ballot_submitted: "success", // Success: Submitted
  published: "info", // Information: Published
  cancelled: "danger", // Error: Cancelled
};

/** 比赛状态的语气。 */
export function matchStatusTone(status: string): StatusTone {
  return MATCH_STATUS_TONES[status] ?? "neutral";
}

/* ------------------------------------------------------------ 现场看板 */

const LIVE_STATE_TONES: Record<LiveState, StatusTone> = {
  neutral: "neutral", // 还没到需要提醒的时间
  warning: "danger", // "有缺人"是要立刻处理的问题（Error: Conflict）
  ready: "info", // 人到齐了，可以开始
  live: "active", // Active: Live
  complete: "success", // Success: Complete
  cancelled: "danger", // Error: Cancelled
};

/** 现场看板每场比赛状态的语气。 */
export function liveStateTone(state: LiveState): StatusTone {
  return LIVE_STATE_TONES[state] ?? "neutral";
}

/* ---------------------------------------------------------------- 通知 */

const NOTICE_STATUS_TONES: Record<string, StatusTone> = {
  draft: "neutral", // Neutral: Draft
  scheduled: "warning", // Pending: Scheduled
  published: "info", // Information: Published
  expired: "neutral", // Neutral: Archived
};

/** 通知发布状态的语气。 */
export function noticeStatusTone(status: string): StatusTone {
  return NOTICE_STATUS_TONES[status] ?? "neutral";
}

/* ------------------------------------------------------------ 邮件出站 */

const EMAIL_STATUS_TONES: Record<string, StatusTone> = {
  pending: "neutral", // 还没到发送时间
  sending: "info", // 正在发送 —— 只是信息，不用报警
  sent: "success", // Success
  failed: "danger", // Error: Failed
  cancelled: "neutral", // 主动取消，不是错误
};

/** 邮件发送状态的语气。 */
export function emailDeliveryTone(status: string): StatusTone {
  return EMAIL_STATUS_TONES[status] ?? "neutral";
}

/* ---------------------------------------------------------------- 审计 */

const AUDIT_ACTION_TONES: Record<string, StatusTone> = {
  insert: "neutral",
  update: "neutral",
  /** 删除是审计日志里唯一需要一眼看到的事，所以只有它用红色。 */
  delete: "danger",
};

/** 审计动作的语气。 */
export function auditActionTone(action: string): StatusTone {
  return AUDIT_ACTION_TONES[action] ?? "neutral";
}

/* ------------------------------------------------------------ 复核请求 */

const REVIEW_REQUEST_TONES: Record<string, StatusTone> = {
  open: "attention", // Attention: Needs attention
  reviewing: "active", // In progress
  resolved: "success", // 处理完了
  rejected: "danger", // Error: Declined
};

/** 学生复核请求状态的语气。 */
export function reviewRequestTone(status: string): StatusTone {
  return REVIEW_REQUEST_TONES[status] ?? "neutral";
}

/* ------------------------------------------------------------ 配对提案 */

const PAIRING_PROPOSAL_TONES: Record<keyof typeof PAIRING_PROPOSAL_STATUS_LABELS, StatusTone> = {
  draft: "neutral", // 还没确认
  confirmed: "success", // Success: Confirmed
  superseded: "neutral", // 被新的生成取代 —— 只是历史，不是错误
};

/** 配对提案状态的语气。 */
export function pairingProposalTone(
  status: keyof typeof PAIRING_PROPOSAL_STATUS_LABELS,
): StatusTone {
  return PAIRING_PROPOSAL_TONES[status] ?? "neutral";
}
