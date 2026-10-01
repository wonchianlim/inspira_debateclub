import { STUDENT_HIDDEN_EVENT_STATUSES, type EventStatus } from "@/lib/domain/event-lifecycle";

/**
 * 俱乐部管理首页的判断（UI/UX 规范 §11.1「Club Admin Home」）。
 *
 * 规范原文：
 *   "1. **Active/next event operational card** — Event title/date/status.
 *     Metrics: debaters, judges, rooms, unresolved issues. Readiness summary and
 *     `Manage event`.
 *    2. **Needs attention** — Examples: unassigned judges, registration conflicts,
 *     missing teams, overdue ballots, failed email batch.
 *     **Sort by severity and deadline; every item links directly to resolution.**"
 *
 * ⚠️ 为什么单独成模块（和前几个端一样的理由）：
 * "什么算需要处理"是一组**产品规则**，不是排版。埋在 JSX 的三目里，
 * 就没有任何测试覆盖得到 —— 而这一页的全部价值恰恰在于"它有没有漏掉该提醒的事"。
 */

/** 首页需要的最小活动形状（`EventSummary` 的子集，便于测试构造）。 */
export type ClubAdminEvent = {
  id: string;
  title: string;
  status: EventStatus;
  eventDate: string;
  startsAt: string;
  registrationClosesAt: string;
};

/** 被选为"现在要盯的那一场"的数据快照。 */
export type FeaturedEventSnapshot = {
  eventId: string;
  /** 已报名（含已签到）人数 */
  registeredCount: number;
  /** 报名里需要管理员在配对前处理的人数（没填偏好 / 没有合格赛制） */
  registrationIssueCount: number;
  /** 已经生成的比赛数 */
  matchCount: number;
  /** 一场裁判都没安排的比赛数 */
  unassignedJudgeMatchCount: number;
  /** 还没提交的评分表数 */
  ballotsUnsubmittedCount: number;
  /** 应当提交的评分表数（有裁判的比赛数） */
  ballotsExpectedCount: number;
  /** 学生提出、还没处理完的复核请求数 */
  unresolvedReviewCount: number;
};

export type ClubAdminHomeInput = {
  events: readonly ClubAdminEvent[];
  featured: FeaturedEventSnapshot | null;
  /** 发送失败的邮件数（`email_outbox`） */
  failedEmailCount: number;
  now: Date;
};

/* --------------------------------------------------------- 盯哪一场活动 */

/**
 * 首页最上面那张卡应该放哪一场。
 *
 * 优先级：**正在进行/即将开始的**那场 → 下一场还没开始的 → 没有。
 * 顺序理由：`live` / `ready` / `pairing` 都是"今天就要处理"的状态；
 * 其次按开始时间最近的。
 */
export function selectOperationalEvent<T extends ClubAdminEvent>(
  events: readonly T[],
  now: Date,
): { kind: "in-progress" | "upcoming" | "none"; event: T | null } {
  const visible = events.filter((event) => !STUDENT_HIDDEN_EVENT_STATUSES.includes(event.status));

  const inProgress = visible
    .filter(
      (event) => event.status === "live" || event.status === "ready" || event.status === "pairing",
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  if (inProgress[0]) return { kind: "in-progress", event: inProgress[0] };

  const upcoming = visible
    .filter((event) => new Date(event.startsAt).getTime() >= now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  if (upcoming[0]) return { kind: "upcoming", event: upcoming[0] };

  return { kind: "none", event: null };
}

/** 之后的活动（不含被选中的那场），从近到远，最多 `limit` 条。 */
export function selectFollowingEvents<T extends ClubAdminEvent>(
  events: readonly T[],
  now: Date,
  excludeEventId: string | null,
  limit = 5,
): T[] {
  return events
    .filter((event) => !STUDENT_HIDDEN_EVENT_STATUSES.includes(event.status))
    .filter((event) => event.id !== excludeEventId)
    .filter((event) => new Date(event.startsAt).getTime() >= now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, limit);
}

/* --------------------------------------------------------- 需要处理 */

export type AttentionSeverity = "high" | "medium";

export type AttentionItem = {
  /** 稳定的键：排序与测试都用它，不用中文标签 */
  key: string;
  severity: AttentionSeverity;
  label: string;
  href: string;
  /** 严重程度相同按这个排（小的在前）；规范的"sort by severity and deadline" */
  order: number;
};

/**
 * 该提醒管理员的事。
 *
 * ⚠️ 每一条都必须**能点进去处理**（规范："every item links directly to resolution"）。
 * 只报警不给入口的看板，管理员看两次就不看了。
 *
 * ⚠️ 顺序必须是确定的：先按严重程度，再按 `order`，最后按 `key` 兜底 ——
 * 否则同一个数据每次刷新顺序可能不同，管理员会以为界面在闪。
 */
export function needsAttention(input: ClubAdminHomeInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const featured = input.featured;
  const eventBase = featured ? `/manage/events/${featured.eventId}` : "";

  if (featured) {
    // 学生提了复核请求却没人处理 —— 这是唯一"有人在等回复"的一类，最急
    if (featured.unresolvedReviewCount > 0) {
      items.push({
        key: "unresolved-reviews",
        severity: "high",
        label: `有 ${featured.unresolvedReviewCount} 条学生复核请求还没处理`,
        href: `${eventBase}/ballots`,
        order: 10,
      });
    }

    // 开了比赛却没裁判，现场会卡住
    if (featured.unassignedJudgeMatchCount > 0) {
      items.push({
        key: "unassigned-judges",
        severity: "high",
        label: `有 ${featured.unassignedJudgeMatchCount} 场比赛还没有裁判`,
        href: `${eventBase}/matches`,
        order: 20,
      });
    }

    // 报名里有配对前必须处理的问题
    if (featured.registrationIssueCount > 0) {
      items.push({
        key: "registration-issues",
        severity: "medium",
        label: `有 ${featured.registrationIssueCount} 位报名者需要处理（没填赛制偏好或没有合格赛制）`,
        href: `${eventBase}/registrations`,
        order: 30,
      });
    }

    // 有比赛但一场都没生成 —— 报名都收了，下一步就是配对
    if (featured.matchCount === 0 && featured.registeredCount > 0) {
      items.push({
        key: "no-matches",
        severity: "medium",
        label: `已经有人报名，但还没有生成比赛`,
        href: `${eventBase}/pairing`,
        order: 40,
      });
    }

    // 交了裁判却还没交表
    if (featured.ballotsUnsubmittedCount > 0) {
      items.push({
        key: "ballots-outstanding",
        severity: "medium",
        label: `还有 ${featured.ballotsUnsubmittedCount} 份评分表没有提交（应提交 ${featured.ballotsExpectedCount} 份）`,
        href: `${eventBase}/ballots`,
        order: 50,
      });
    }
  }

  // 邮件发送失败是跨活动的基础设施问题，和具体哪一场无关
  if (input.failedEmailCount > 0) {
    items.push({
      key: "failed-emails",
      severity: "high",
      label: `有 ${input.failedEmailCount} 封邮件发送失败`,
      href: "/admin/email",
      order: 15,
    });
  }

  return items.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.order - b.order ||
      a.key.localeCompare(b.key),
  );
}

function severityRank(severity: AttentionSeverity): number {
  return severity === "high" ? 0 : 1;
}
