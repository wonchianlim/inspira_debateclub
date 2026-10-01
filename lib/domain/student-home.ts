import type { EventStatus } from "@/lib/domain/event-lifecycle";
import { registrationWindowState } from "@/lib/domain/registration";
import type { RegistrationStatus } from "@/lib/validation/registrations";

/**
 * 学生首页要做的几个**判断**（UI/UX 规范 §8.1「Student Home」）。
 *
 * 为什么单独成模块：这些判断都是规则，不是排版 ——
 * "哪一场是下一场"、"主按钮该写报名还是签到"、"主要赛制是哪一个"、
 * "这位学生是不是还没有任何记录"。
 *
 * ⚠️ 阶段 3b 的教训：埋在 JSX 的 `filter` 与三目里的判断**没有任何测试会覆盖到**。
 * 把它们搬到纯函数里，就可以穷举边界（已取消的活动、签到还没开放、
 * 一场都没打过……），而不是等学生来报。
 */

/**
 * 首页需要的活动字段。
 *
 * 是 `StudentEventCard` 的子集（用泛型收窄），这样测试里可以只构造用到的字段。
 */
export type StudentHomeEvent = {
  id: string;
  title: string;
  status: EventStatus;
  /** 活动自己的时区 —— 展示时间一律用它，不用服务器或浏览器时区 */
  timezone: string;
  /** 这场活动启用了几个赛制 */
  enabledFormatCount: number;
  /** 线下场地；线上活动为空。展示"在哪打"时用 `describeEventLocation()` */
  venue: string | null;
  /** 线上会议链接；没有时为空 */
  meetingUrl: string | null;
  startsAt: string;
  checkInOpensAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  myRegistrationStatus: RegistrationStatus | null;
};

/**
 * 学生不该在首页看到的活动状态。
 *
 * 草稿是管理员还在准备的；已取消与已归档没有可做的事。
 * ⚠️ 这只是**呈现**层面的过滤 —— 真正的边界是 RLS。
 */
const HIDDEN_EVENT_STATUSES: readonly EventStatus[] = ["draft", "cancelled", "archived"];

function startTime(event: StudentHomeEvent): number {
  return new Date(event.startsAt).getTime();
}

/** 还没开始、且学生应当看到的活动，按开始时间从近到远。 */
export function selectUpcomingEvents<T extends StudentHomeEvent>(
  events: readonly T[],
  now: Date,
  limit = 3,
): T[] {
  return events
    .filter((event) => !HIDDEN_EVENT_STATUSES.includes(event.status))
    .filter((event) => startTime(event) >= now.getTime())
    .sort((a, b) => startTime(a) - startTime(b))
    .slice(0, limit);
}

/** 最近的一场；没有则为 null。 */
export function selectNextEvent<T extends StudentHomeEvent>(
  events: readonly T[],
  now: Date,
): T | null {
  return selectUpcomingEvents(events, now, 1)[0] ?? null;
}

export type HeroActionKind = "register" | "check-in" | "view";

export type HeroAction = {
  kind: HeroActionKind;
  label: string;
  href: string;
};

/** 学生端目前只有活动详情这一个页面，因此三种动作都指向它。 */
function eventHref(eventId: string): string {
  return `/student/events/${eventId}`;
}

/**
 * 首页 hero 上的主按钮。
 *
 * ⚠️ 规范 §8.1 列了六种动作（Register / Check in / View pairing / Enter debate /
 * View result / Read feedback），但学生端**目前只有活动详情页**。
 * 本项目有一条硬规则：导航只使用已存在的路由，避免死链。
 * 所以这里只可能产出三种，且都落在详情页 —— 详情页里确实有报名与签到按钮，
 * 点进去真能完成那件事，不是虚的。等阶段 5 有了 /rounds、/results、/feedback
 * 之后再把动作扩全。
 *
 * ⚠️ 签到用 `checkInOpensAt`（活动创建时按俱乐部设置算好写进库里的那一列），
 * 不用 `CHECK_IN_OPENS_MINUTES_BEFORE` 那个常量 —— 后者只是写入时的默认值，
 * 管理员改过设置之后两者就不相等了。
 */
export function heroAction(event: StudentHomeEvent, now: Date): HeroAction {
  const href = eventHref(event.id);

  // 已签到：没有可做的事，只能看详情
  if (event.myRegistrationStatus === "checked_in") {
    return { kind: "view", label: "查看活动", href };
  }

  // 走到这里只可能是"已报名"：已签到在上面的提前返回里处理掉了
  if (event.myRegistrationStatus === "registered") {
    const checkInOpen = now.getTime() >= new Date(event.checkInOpensAt).getTime();
    return checkInOpen
      ? { kind: "check-in", label: "去签到", href }
      : { kind: "view", label: "查看活动", href };
  }

  const windowState = registrationWindowState({
    eventStatus: event.status,
    registrationOpensAt: new Date(event.registrationOpensAt),
    registrationClosesAt: new Date(event.registrationClosesAt),
    now,
  });

  return windowState === "open"
    ? { kind: "register", label: "去报名", href }
    : { kind: "view", label: "查看活动", href };
}

/* ------------------------------------------------------------------ 指标 */

export type HomeMetricKey = "debates" | "primaryFormat" | "feedback";

/**
 * 首页最多三张指标卡，**数据没有意义时就不显示**（规范 §8.1）。
 *
 * - 「已完成的辩论场次」总是显示：0 也是一句有用的话（"你还没打过"）；
 * - 「主要赛制」需要至少打过一场，否则没有任何赛制可称"主要"；
 * - 「可看的反馈」为 0 时不显示 —— "0 条反馈"只是噪音。
 */
export function selectHomeMetrics(input: {
  totalDebates: number;
  primaryFormatCode: string | null;
  feedbackCount: number;
}): HomeMetricKey[] {
  const keys: HomeMetricKey[] = ["debates"];
  if (input.totalDebates > 0 && input.primaryFormatCode) keys.push("primaryFormat");
  if (input.feedbackCount > 0) keys.push("feedback");
  return keys.slice(0, 3);
}

/**
 * 主要赛制 = 打得最多的那个。
 *
 * 并列时按赛制代码字母序取第一个 —— 必须是**确定的**，
 * 否则同一个学生每次刷新看到的"主要赛制"都可能不一样。
 * 一场都没打过时返回 null（调用方据此不显示这张卡）。
 */
export function primaryFormatCode(
  byFormat: readonly { formatCode: string; debates: number }[],
): string | null {
  let best: { formatCode: string; debates: number } | null = null;
  for (const entry of byFormat) {
    if (entry.debates <= 0) continue;
    const better =
      best === null ||
      entry.debates > best.debates ||
      (entry.debates === best.debates && entry.formatCode.localeCompare(best.formatCode) < 0);
    if (better) best = entry;
  }
  return best?.formatCode ?? null;
}

/**
 * 新学生 = 没有即将到来的活动、没有打过、也没有可看的反馈。
 *
 * 规范 §8.1 要求这种情况下显示一段**引导**（"你的辩论之旅从这里开始" +
 * 浏览活动），而不是一个巨大的空白框。
 */
export function isNewStudent(input: {
  upcomingEventCount: number;
  totalDebates: number;
  feedbackCount: number;
}): boolean {
  return input.upcomingEventCount === 0 && input.totalDebates === 0 && input.feedbackCount === 0;
}
