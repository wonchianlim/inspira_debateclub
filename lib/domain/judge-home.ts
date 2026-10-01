import type { BallotStatus } from "@/lib/domain/ballot-lifecycle";
import type { JudgeApprovalStatus } from "@/lib/domain/judge-eligibility";

/**
 * 裁判工作台的判断（UI/UX 规范 §9.1「Judge Home」）。
 *
 * 规范原文：
 *   "Lead with `Next assignment` and its actionable state. Then show:
 *    `Ballots due` count. Upcoming assignments. Draft ballots.
 *    Recent submitted ballots. Qualification/application notice if approval is incomplete.
 *    If unapproved, replace operational content with application status and next steps."
 *
 * ⚠️ 与 4b-1（学生首页）同样的做法：把判断写成纯函数，而不是埋在 JSX 的三目里。
 * 页面里的 `filter` 没有任何测试覆盖得到 —— 这一点在本项目已经栽过几次。
 *
 * ⚠️ 一处刻意的解释：规范的分段叫 `Upcoming` / `Completed`，
 * 这里按**我的工作是否完成**分（评分表是否交上来），而不是按比赛时间分。
 * 理由：裁判真正要回答的问题是"我还欠哪几份"。
 * 一场两周前、评分表一直没交的比赛如果被归进 "Completed"，那份欠账就**看不见了**。
 */

/** 工作台需要的最小形状（`JudgeAssignedMatch` 的子集，便于测试构造）。 */
export type JudgeHomeMatch = {
  matchId: string;
  matchNumber: number;
  roomName: string;
  formatCode: string;
  scheduledStart: string;
  matchStatus: string;
  /** 这份评分表的状态；null 表示还没开始填 */
  ballotStatus: BallotStatus | null;
  /** 这个赛制有没有活跃模板 —— 没有的话裁判根本没法打分 */
  hasTemplate: boolean;
};

/** 首页「最近提交」最多列几条。 */
export const RECENT_SUBMITTED_LIMIT = 3;

function startTime(match: JudgeHomeMatch): number {
  return new Date(match.scheduledStart).getTime();
}

/**
 * 这份评分表**还欠着**（尚未提交）。
 *
 * `reopened` 也算欠着 —— 那正是它存在的意义：管理员要求更正，而更正还没发生。
 * （这一点在 `isBallotSubmittedForDashboard()` 里已经写死过，这里保持一致。）
 */
export function isBallotPending(match: JudgeHomeMatch): boolean {
  return (
    match.ballotStatus === null ||
    match.ballotStatus === "draft" ||
    match.ballotStatus === "reopened"
  );
}

/** 已经交上去了（含已发布）。 */
export function isBallotSubmitted(match: JudgeHomeMatch): boolean {
  return (
    match.ballotStatus === "submitted" ||
    match.ballotStatus === "resubmitted" ||
    match.ballotStatus === "published"
  );
}

/**
 * 首屏那一条「下一场」。
 *
 * 规则：在**还欠着的**比赛里取开始时间最早的。
 * 这样"早就该交、一直没交"的那一场会自然排在最前面 —— 它比未来那场更急。
 * 全都交完了（或没有被指派）时返回 null。
 */
export function selectNextAssignment(matches: readonly JudgeHomeMatch[]): JudgeHomeMatch | null {
  const pending = matches.filter(isBallotPending);
  if (pending.length === 0) return null;
  const sorted = [...pending].sort(
    (a, b) => startTime(a) - startTime(b) || a.matchNumber - b.matchNumber,
  );
  return sorted[0] ?? null;
}

/**
 * `Ballots due`：还欠着几份。
 *
 * ⚠️ 规范没有定义 "due" 是"未提交"还是"已过期未提交"。
 * 这里取**未提交**：它是裁判能直接行动的那个数字。
 * "已过期"单独由 `overdueBallots()` 给出（更急，但不改变待办总数）。
 */
export function ballotsDueCount(matches: readonly JudgeHomeMatch[]): number {
  return matches.filter(isBallotPending).length;
}

/** 已经**过了开始时间**却还没提交的 —— 这些最急。 */
export function overdueBallots(matches: readonly JudgeHomeMatch[], now: Date): JudgeHomeMatch[] {
  return matches.filter((match) => isBallotPending(match) && startTime(match) < now.getTime());
}

/** 开了头但还没交的（`draft`）。规范单独列它，因为"改一改就能交"和"还没动"不一样。 */
export function draftBallots(matches: readonly JudgeHomeMatch[]): JudgeHomeMatch[] {
  return matches.filter((match) => match.ballotStatus === "draft");
}

/** 最近交上去的几份，新的在前。 */
export function recentlySubmitted(
  matches: readonly JudgeHomeMatch[],
  limit: number = RECENT_SUBMITTED_LIMIT,
): JudgeHomeMatch[] {
  return matches
    .filter(isBallotSubmitted)
    .sort((a, b) => startTime(b) - startTime(a) || b.matchNumber - a.matchNumber)
    .slice(0, limit);
}

/**
 * 按**我的工作是否完成**分成两段（规范 §9.2 的 `Upcoming` / `Completed`）。
 *
 * 待办按"最近的在前"（接下来要做的先看到），已交的按"最新的在前"。
 */
export function partitionAssignments(matches: readonly JudgeHomeMatch[]): {
  upcoming: JudgeHomeMatch[];
  completed: JudgeHomeMatch[];
} {
  return {
    upcoming: matches
      .filter(isBallotPending)
      .sort((a, b) => startTime(a) - startTime(b) || a.matchNumber - b.matchNumber),
    completed: matches
      .filter(isBallotSubmitted)
      .sort((a, b) => startTime(b) - startTime(a) || b.matchNumber - a.matchNumber),
  };
}

/* ------------------------------------------------------------ 审批状态 */

/**
 * 裁判账号能不能干活。
 *
 * ⚠️ 这一条解决的是一个**会说假话的界面**：未获批准的裁判被指派不了任何比赛，
 * 于是原来那一页显示"目前没有指派给你的比赛 / 管理员指派之后你会看到"——
 * 而真实原因是**申请还没批**。他会一直等一个永远不会来的指派。
 * 规范 §9.1 要求：未获批准时用申请状态与下一步**替换**操作性内容。
 */
export type JudgeAccessState = "active" | "pending" | "rejected" | "suspended" | "no-profile";

export function judgeAccessState(
  profile: { approvalStatus: JudgeApprovalStatus } | null | undefined,
): JudgeAccessState {
  if (!profile) return "no-profile";
  return profile.approvalStatus === "approved" ? "active" : profile.approvalStatus;
}

/** 只有 `active` 才显示操作性内容（比赛列表、待办数字）。 */
export function isJudgeOperational(state: JudgeAccessState): boolean {
  return state === "active";
}
