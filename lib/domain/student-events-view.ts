import { STUDENT_HIDDEN_EVENT_STATUSES, type EventStatus } from "@/lib/domain/event-lifecycle";
import { describeEventLocation } from "@/lib/domain/event-location";
import type { RegistrationStatus } from "@/lib/validation/registrations";

/**
 * 学生活动列表的**分段与筛选**（UI/UX 规范 §8.2）。
 *
 * 规范原文：
 *   "Segmented tabs: `Upcoming`, `Past`."
 *   "Filters: format, location/online, registration status."
 *   "Filter no-match: `No events match these filters.` plus `Clear filters`."
 *
 * ⚠️ 为什么单独成模块：
 *   1. 每个判断都要能穷举测试 —— 尤其是**乱填的网址参数**
 *      （`?location=<script>`、`?tab=123`、`?format=已删除的赛制`）。
 *      页面里的 `filter` 与三目没有任何测试覆盖得到；
 *   2. 分段与筛选是**纯函数**，不需要客户端组件。整个列表用网址参数表达状态：
 *      没有额外 JS、可以直接分享链接、浏览器后退键天然可用。
 */

/* ------------------------------------------------------------------ 分段 */

export const EVENTS_TABS = ["upcoming", "past"] as const;
export type EventsTab = (typeof EVENTS_TABS)[number];

export const DEFAULT_EVENTS_TAB: EventsTab = "upcoming";

/* ------------------------------------------------------------------ 筛选 */

export const LOCATION_FILTERS = ["all", "online", "in_person"] as const;
export type LocationFilter = (typeof LOCATION_FILTERS)[number];

export const REGISTRATION_FILTERS = ["all", "registered", "not_registered"] as const;
export type RegistrationFilter = (typeof REGISTRATION_FILTERS)[number];

export type EventsView = {
  tab: EventsTab;
  /** 赛制代码；`null` 表示不限 */
  formatCode: string | null;
  location: LocationFilter;
  registration: RegistrationFilter;
};

export const DEFAULT_EVENTS_VIEW: EventsView = {
  tab: DEFAULT_EVENTS_TAB,
  formatCode: null,
  location: "all",
  registration: "all",
};

/** 网址参数可能是数组（`?tab=a&tab=b`），只取第一个。 */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * 把网址参数收敛成合法的视图。
 *
 * ⚠️ 这一段**必须**对任意输入都返回一个能用的视图，而不是报错：
 * 地址栏是用户可以随手改的地方。未知值一律退化成默认值 ——
 * 尤其是赛制：`?format=XX`（一个已被删除的赛制）必须退化成"不限"，
 * 否则页面会永远显示"没有符合条件的活动"，而用户看不出原因。
 */
export function parseEventsView(
  params: {
    tab?: string | string[];
    format?: string | string[];
    location?: string | string[];
    registration?: string | string[];
  },
  availableFormatCodes: readonly string[],
): EventsView {
  const requestedFormat = firstValue(params.format);
  return {
    tab: oneOf(EVENTS_TABS, firstValue(params.tab), DEFAULT_EVENTS_TAB),
    formatCode:
      requestedFormat && availableFormatCodes.includes(requestedFormat) ? requestedFormat : null,
    location: oneOf(LOCATION_FILTERS, firstValue(params.location), "all"),
    registration: oneOf(REGISTRATION_FILTERS, firstValue(params.registration), "all"),
  };
}

/** 视图是否带了任何筛选（用于决定要不要显示"清除筛选"）。 */
export function hasActiveFilters(view: EventsView): boolean {
  return view.formatCode !== null || view.location !== "all" || view.registration !== "all";
}

/* ------------------------------------------------------------------ 选择 */

/** 筛选与分段需要的最小活动形状（`StudentEventCard` 的子集，便于测试构造）。 */
export type StudentEventsListItem = {
  status: EventStatus;
  startsAt: string;
  venue: string | null;
  meetingUrl: string | null;
  enabledFormatCodes: string[];
  myRegistrationStatus: RegistrationStatus | null;
};

/** 已经报上名（含已签到）。其余一切（含已取消、未到场）都算"未报名"。 */
function isRegistered(event: StudentEventsListItem): boolean {
  return event.myRegistrationStatus === "registered" || event.myRegistrationStatus === "checked_in";
}

function matchesFilters(event: StudentEventsListItem, view: EventsView): boolean {
  if (view.formatCode && !event.enabledFormatCodes.includes(view.formatCode)) return false;

  if (view.location !== "all") {
    const { kind } = describeEventLocation(event);
    // 只有"确知是线上/线下"的活动才通过筛选；地点待定的活动两边都不属于
    if (view.location === "online" && kind !== "online") return false;
    if (view.location === "in_person" && kind !== "venue") return false;
  }

  if (view.registration === "registered" && !isRegistered(event)) return false;
  if (view.registration === "not_registered" && isRegistered(event)) return false;

  return true;
}

export type StudentEventsSelection<T> = {
  /** 还没开始，按开始时间**从近到远** */
  upcoming: T[];
  /** 已经结束，按开始时间**从新到旧** */
  past: T[];
};

/**
 * 先筛掉学生不该看到的活动，再应用筛选，最后按"还没开始 / 已经结束"分段。
 *
 * ⚠️ 顺序是刻意的：**先筛选再分段**，因此两个分段上的数量就是筛选之后的数量，
 * 与切过去看到的条数一致。反过来做的话，标签上写着 12 条、点进去只有 2 条。
 */
export function selectStudentEvents<T extends StudentEventsListItem>(
  events: readonly T[],
  now: Date,
  view: EventsView,
): StudentEventsSelection<T> {
  const visible = events
    .filter((event) => !STUDENT_HIDDEN_EVENT_STATUSES.includes(event.status))
    .filter((event) => matchesFilters(event, view));

  const startTime = (event: T) => new Date(event.startsAt).getTime();

  return {
    upcoming: visible
      .filter((event) => startTime(event) >= now.getTime())
      .sort((a, b) => startTime(a) - startTime(b)),
    past: visible
      .filter((event) => startTime(event) < now.getTime())
      .sort((a, b) => startTime(b) - startTime(a)),
  };
}

/* -------------------------------------------------------------- 生成链接 */

/**
 * 生成一个保留了其它条件、只改动某一项的活动列表链接。
 *
 * 深链与"清除筛选"都靠它 —— 手拼字符串的话，很容易在切标签时把筛选条件弄丢。
 * 默认值一律不写进网址，保证 `/student/events` 与
 * `/student/events?tab=upcoming&location=all` 指向同一个页面。
 */
export function buildEventsHref(view: EventsView, patch: Partial<EventsView> = {}): string {
  const next: EventsView = { ...view, ...patch };
  const params = new URLSearchParams();
  if (next.tab !== DEFAULT_EVENTS_TAB) params.set("tab", next.tab);
  if (next.formatCode) params.set("format", next.formatCode);
  if (next.location !== "all") params.set("location", next.location);
  if (next.registration !== "all") params.set("registration", next.registration);
  const query = params.toString();
  return query ? `/student/events?${query}` : "/student/events";
}
