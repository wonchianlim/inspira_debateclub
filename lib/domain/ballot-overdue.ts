import { type BallotStatus, isBallotSubmittedForDashboard } from "@/lib/domain/ballot-lifecycle";

/**
 * 评分表超时判定（Phase 7 / P7-7）。
 *
 * 规范第 15 节 Phase 7 要求对未交的评分表做提醒。
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 关于"多久算超时"
 *
 * 规范**没有给出**这个数值，比赛时长也没有存在系统里。因此这里用一个
 * **明确写出来的默认值**，而不是把它藏进某个查询里：
 *
 *   比赛开始后 **90 分钟**仍未提交 → 视为超时
 *
 * 为什么是 90 分钟：一场辩论（含准备、发言、裁判打分）通常在一小时上下，
 * 90 分钟留出了余量。这是**我的选择，不是规范里的数字** ——
 * 如果产品负责人有更合适的值，改这一个常量即可。
 *
 * 超时**只是标记**，不会阻止任何操作。没有邮件服务商之前，
 * 它的作用是让管理员在页面上**一眼看到哪几场还差**，
 * 而不是让人去逐条比对。
 */

/** 比赛开始后多久仍未提交就算超时（分钟）。见上方说明。 */
export const OVERDUE_GRACE_MINUTES = 90;

export type BallotOverdue = {
  overdue: boolean;
  /** 已经超过了多少分钟；未超时为 0 */
  minutesOverdue: number;
  /** 可直接显示的中文说明 */
  message: string;
};

/**
 * 判断一份评分表是否超时。
 *
 * @param scheduledStart 比赛计划开始时间（UTC）
 * @param status 评分表状态；`null` 表示裁判还没开始填
 * @param now 当前时间（注入以便测试）
 */
export function checkBallotOverdue(
  scheduledStart: Date,
  status: BallotStatus | null,
  now: Date = new Date(),
  graceMinutes: number = OVERDUE_GRACE_MINUTES,
): BallotOverdue {
  /*
   * ⚠️ `reopened` **算超时**。
   *
   * 管理员重开是为了让裁判更正，而更正还没交回来 —— 那正是需要被看见的状态。
   * 把它当成"已处理"会让最需要跟进的那一份从提醒里消失。
   * （这与看板口径一致：`isBallotSubmittedForDashboard("reopened")` 也是 false。）
   */
  if (status !== null && isBallotSubmittedForDashboard(status)) {
    return { overdue: false, minutesOverdue: 0, message: "" };
  }

  const deadline = new Date(scheduledStart.getTime() + graceMinutes * 60 * 1000);
  const diffMs = now.getTime() - deadline.getTime();
  if (diffMs <= 0) {
    return { overdue: false, minutesOverdue: 0, message: "" };
  }

  const minutesOverdue = Math.floor(diffMs / 60000);
  return {
    overdue: true,
    minutesOverdue,
    message:
      status === null
        ? `比赛开始已超过 ${graceMinutes} 分钟，这位裁判还没有开始填写评分表。`
        : `比赛开始已超过 ${graceMinutes} 分钟，评分表仍未提交（当前：${status === "reopened" ? "已被重开，等裁判重新提交" : "草稿"}）。`,
  };
}

/** 从一组评分表里挑出超时的那些，按超时时间从久到近排序。 */
export function selectOverdueBallots<
  T extends { scheduledStart: string; status: BallotStatus | null },
>(ballots: readonly T[], now: Date = new Date()): { ballot: T; overdue: BallotOverdue }[] {
  return ballots
    .map((ballot) => ({
      ballot,
      overdue: checkBallotOverdue(new Date(ballot.scheduledStart), ballot.status, now),
    }))
    .filter((entry) => entry.overdue.overdue)
    .sort((a, b) => b.overdue.minutesOverdue - a.overdue.minutesOverdue);
}
