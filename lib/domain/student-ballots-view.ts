/**
 * 学生看到的已发布评分表的**分组与顺序**（UI/UX 规范 §8.7）。
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 为什么需要它：一场比赛可以有多位裁判
 *
 * 数据库约束是 `ballots_match_judge_key unique (match_id, judge_id)` ——
 * 也就是说**同一场比赛可以有多份评分表**（PF 这类赛制本来就是裁判团）。
 * 学生端原来只是把每一份平铺成一张卡：
 *
 *     「第 3 场 · A101」分数 A
 *     「第 3 场 · A101」分数 B
 *     「第 3 场 · A101」分数 C
 *
 * 三张几乎一样、数字却不同的卡片，**没有任何说明**。学生看到的第一反应是
 * "系统坏了"，而不是"这是三位裁判各自的评分表"。
 *
 * 因此这里按**比赛**分组，组内每份给一个**匿名序号**（裁判 1、裁判 2……）。
 * 匿名是刻意的：规范 §8.7 说的是 "judge name or `Judge` according to anonymity
 * policy"，而"要不要向学生公开裁判姓名"是产品负责人尚未拍板的政策。
 * 序号既能消除歧义，又不泄露身份。
 *
 * ⚠️ 顺序必须**确定**：`localeCompare` 排同一个开始时间的两份评分表时没有稳定的
 * 先后关系，同一个学生刷新两次可能看到"裁判 1 / 裁判 2"对调。
 * 因此最后一定再用 `ballotId` 兜底排序。
 */

export type GroupableBallot = {
  ballotId: string;
  matchId: string;
  scheduledStart: string;
};

export type BallotGroup<T extends GroupableBallot> = {
  matchId: string;
  scheduledStart: string;
  /** 组内每一份评分表，附带匿名序号（只有一份时为 null，不显示"裁判 1"这种废话） */
  documents: { ballot: T; anonymousLabel: string | null }[];
};

/** 组内的匿名名称。只有一位裁判时不使用。 */
export function anonymousJudgeLabel(index: number): string {
  // 界面语言固定为英文（2026-10-01）。学生在"我的评分表"里看到的就是这个标签。
  return `Judge ${index + 1}`;
}

/** 新的在前；同一开始时间按 matchId、ballotId 兜底，保证顺序确定。 */
function compareBallots(a: GroupableBallot, b: GroupableBallot): number {
  const byStart = b.scheduledStart.localeCompare(a.scheduledStart);
  if (byStart !== 0) return byStart;
  const byMatch = a.matchId.localeCompare(b.matchId);
  if (byMatch !== 0) return byMatch;
  return a.ballotId.localeCompare(b.ballotId);
}

/**
 * 把评分表按比赛分组。
 *
 * 同一场比赛的几份评分表放在一组里，学生能一眼看出"这是同一场的三位裁判"。
 */
export function groupPublishedBallots<T extends GroupableBallot>(
  ballots: readonly T[],
): BallotGroup<T>[] {
  const sorted = [...ballots].sort(compareBallots);
  const groups: BallotGroup<T>[] = [];

  for (const ballot of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.matchId === ballot.matchId) {
      last.documents.push({ ballot, anonymousLabel: null });
      continue;
    }
    groups.push({
      matchId: ballot.matchId,
      scheduledStart: ballot.scheduledStart,
      documents: [{ ballot, anonymousLabel: null }],
    });
  }

  // 只有一组里确实有多份时才编号 —— 单独一份时"裁判 1"是纯噪音
  for (const group of groups) {
    if (group.documents.length < 2) continue;
    group.documents = group.documents.map((entry, index) => ({
      ...entry,
      anonymousLabel: anonymousJudgeLabel(index),
    }));
  }

  return groups;
}
