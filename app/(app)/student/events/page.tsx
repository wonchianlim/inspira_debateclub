import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { registrationStatusTone, registrationWindowTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { describeEventLocation } from "@/lib/domain/event-location";
import { EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { registrationWindowState } from "@/lib/domain/registration";
import { heroAction } from "@/lib/domain/student-home";
import {
  buildEventsHref,
  hasActiveFilters,
  parseEventsView,
  selectStudentEvents,
  type EventsView,
} from "@/lib/domain/student-events-view";
import { utcToZonedLocal } from "@/lib/domain/timezone";
import { listStudentEvents } from "@/lib/student/registrations";
import {
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_WINDOW_LABELS,
} from "@/lib/validation/registrations";

export const metadata = { title: "活动 · INSPIRA" };

export const dynamic = "force-dynamic";

const TAB_LABELS = { upcoming: "即将到来", past: "已结束" } as const;
const LOCATION_LABELS = { all: "全部", online: "线上", in_person: "线下" } as const;
const REGISTRATION_LABELS = {
  all: "全部",
  registered: "我已报名",
  not_registered: "未报名",
} as const;

/**
 * 学生活动列表（UI/UX 规范 §8.2）。
 *
 * ⚠️ 分段与筛选全部用**网址参数**表达，没有客户端组件：
 * 页面仍是服务端渲染，链接可以直接分享，浏览器后退键天然可用。
 * 判断逻辑（含"乱填的参数怎么办"）都在 `lib/domain/student-events-view.ts`,
 * 那里有穷举测试；页面只负责画出来。
 *
 * ⚠️ 与规范的差异（刻意的）：规范说筛选在移动端"collapse into filter sheet"。
 * 这里没有做那种抽屉，而是把三组筛选做成**可折叠成两行的链接组**
 * （小屏自动换行），因为它不需要任何 JS、也不需要额外的焦点管理，
 * 而"点一下就能筛"这个好处已经拿到了。
 */
export default async function StudentEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    format?: string;
    location?: string;
    registration?: string;
  }>;
}) {
  await requireSession();
  const [events, rawParams] = await Promise.all([listStudentEvents(), searchParams]);
  const now = new Date();

  // 可选的赛制来自**这位学生看得见的活动**，因此不会出现"筛一个根本不存在的赛制"
  const availableFormatCodes = [
    ...new Set(events.flatMap((event) => event.enabledFormatCodes)),
  ].sort();

  const view = parseEventsView(rawParams, availableFormatCodes);
  const { upcoming, past } = selectStudentEvents(events, now, view);
  const listed = view.tab === "upcoming" ? upcoming : past;
  const filtersActive = hasActiveFilters(view);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">活动</h1>
          <p className="text-muted-foreground text-sm">报名、准备，并回顾过去的活动。</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/student">返回我的辩论社</Link>
        </Button>
      </div>

      {/* ---------------- 分段 ---------------- */}
      <nav aria-label="活动分段">
        <ul className="border-border inline-flex rounded-md border p-0.5">
          {(["upcoming", "past"] as const).map((tab) => {
            const count = tab === "upcoming" ? upcoming.length : past.length;
            const current = view.tab === tab;
            return (
              <li key={tab}>
                <Link
                  href={buildEventsHref(view, { tab })}
                  aria-current={current ? "page" : undefined}
                  className={
                    "focus-visible:ring-ring/50 inline-flex min-h-9 items-center rounded px-3 text-sm focus-visible:ring-3 focus-visible:outline-none " +
                    (current
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {TAB_LABELS[tab]}（{count}）
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ---------------- 筛选 ---------------- */}
      <div className="flex flex-col gap-2">
        <FilterRow
          legend="赛制"
          options={[
            { value: null, label: "全部" },
            ...availableFormatCodes.map((code) => ({ value: code, label: code })),
          ]}
          selected={view.formatCode}
          hrefFor={(value) => buildEventsHref(view, { formatCode: value })}
        />
        <FilterRow
          legend="形式"
          options={Object.entries(LOCATION_LABELS).map(([value, label]) => ({ value, label }))}
          selected={view.location}
          hrefFor={(value) => buildEventsHref(view, { location: value as EventsView["location"] })}
        />
        <FilterRow
          legend="报名"
          options={Object.entries(REGISTRATION_LABELS).map(([value, label]) => ({ value, label }))}
          selected={view.registration}
          hrefFor={(value) =>
            buildEventsHref(view, { registration: value as EventsView["registration"] })
          }
        />
        {filtersActive ? (
          <p className="text-sm">
            <Link
              href={buildEventsHref(view, {
                formatCode: null,
                location: "all",
                registration: "all",
              })}
              className="focus-visible:ring-ring/50 rounded underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
            >
              清除筛选
            </Link>
          </p>
        ) : null}
      </div>

      {/* ---------------- 列表 ---------------- */}
      {listed.length === 0 ? (
        filtersActive ? (
          <StatePanel
            variant="empty"
            title="没有符合条件的活动"
            description="换一个赛制或形式试试，或者清除筛选条件。"
            action={
              <Button asChild variant="outline" size="sm">
                <Link
                  href={buildEventsHref(view, {
                    formatCode: null,
                    location: "all",
                    registration: "all",
                  })}
                >
                  清除筛选
                </Link>
              </Button>
            }
          />
        ) : view.tab === "upcoming" ? (
          <StatePanel
            variant="empty"
            title="目前没有即将开始的活动"
            description="活动发布后会出现在这里，同时你也会收到通知。「已结束」里可以看到过去的活动。"
          />
        ) : (
          <StatePanel
            variant="empty"
            title="还没有已结束的活动"
            description="参加过的活动在结束后会归到这里。"
          />
        )
      ) : view.tab === "upcoming" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {upcoming.map((event) => (
            <UpcomingEventCard key={event.id} event={event} now={now} />
          ))}
        </div>
      ) : (
        /*
         * 规范 §8.2：「Past events are denser rows」——
         * 过去的活动已经不需要"报名"这种醒目操作，因此用更紧凑的行，
         * 把空间让给"我参加了没有"。
         */
        <ul className="flex flex-col">
          {past.map((event) => (
            <li
              key={event.id}
              className="border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 last:border-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{event.title}</span>
                <span className="text-muted-foreground text-xs">
                  {utcToZonedLocal(new Date(event.startsAt), event.timezone).replace("T", " ")} ·{" "}
                  {describeEventLocation(event).label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/*
                  参加状态：这是我自己的记录，因此用状态色。
                  从未报名过就没有"状态"可言 —— 用中性，不要编一个出来。
                */}
                {event.myRegistrationStatus ? (
                  <StatusBadge tone={registrationStatusTone(event.myRegistrationStatus)}>
                    {REGISTRATION_STATUS_LABELS[event.myRegistrationStatus]}
                  </StatusBadge>
                ) : (
                  <StatusBadge>未参加</StatusBadge>
                )}
                <Link
                  href={`/student/events/${event.id}`}
                  className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
                >
                  查看活动
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 一行筛选：每个选项是一个链接（没有 JS，点一下就能筛）。 */
function FilterRow({
  legend,
  options,
  selected,
  hrefFor,
}: {
  legend: string;
  options: { value: string | null; label: string }[];
  selected: string | null;
  hrefFor: (value: string | null) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground text-xs">{legend}</span>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {options.map((option) => {
          const current = option.value === selected;
          return (
            <li key={option.value ?? "all"}>
              <Link
                href={hrefFor(option.value)}
                aria-current={current ? "true" : undefined}
                className={
                  "focus-visible:ring-ring/50 rounded text-sm focus-visible:ring-3 focus-visible:outline-none " +
                  (current
                    ? "text-foreground font-medium underline underline-offset-4"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 即将到来的活动卡片（规范 §8.2：日期块 + 一个状态 chip + 一个主操作）。 */
function UpcomingEventCard({
  event,
  now,
}: {
  event: Awaited<ReturnType<typeof listStudentEvents>>[number];
  now: Date;
}) {
  const windowState = registrationWindowState({
    eventStatus: event.status,
    registrationOpensAt: new Date(event.registrationOpensAt),
    registrationClosesAt: new Date(event.registrationClosesAt),
    now,
  });
  const action = heroAction(event, now);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {event.title}
          {/*
            规范 §8.2：「One status chip and one primary action.」
            这一个 chip 回答的是学生真正关心的问题 ——「我现在的处境是什么」：
            已经报名就显示报名状态，否则显示报名窗口。
          */}
          {event.myRegistrationStatus ? (
            <StatusBadge tone={registrationStatusTone(event.myRegistrationStatus)}>
              {REGISTRATION_STATUS_LABELS[event.myRegistrationStatus]}
            </StatusBadge>
          ) : (
            <StatusBadge tone={registrationWindowTone(windowState)}>
              {REGISTRATION_WINDOW_LABELS[windowState] ?? windowState}
            </StatusBadge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
        <p>
          地点：
          <span className="text-foreground">{describeEventLocation(event).label}</span>
          {" · "}
          <span className="text-foreground">{EVENT_STATUS_LABELS[event.status]}</span>
        </p>
        <p>
          开始时间（{event.timezone}）：
          <span className="text-foreground">
            {utcToZonedLocal(new Date(event.startsAt), event.timezone).replace("T", " ")}
          </span>
        </p>
        <p>
          报名截止：
          <span className="text-foreground">
            {utcToZonedLocal(new Date(event.registrationClosesAt), event.timezone).replace(
              "T",
              " ",
            )}
          </span>
        </p>
        {event.enabledFormatCodes.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs">赛制：</span>
            {event.enabledFormatCodes.map((code) => (
              <MetaChip key={code}>{code}</MetaChip>
            ))}
          </div>
        ) : null}
        {/*
          主操作按处境变化：还能报名时是实心的「去报名」，否则是描边的「查看详情」。
          文案与 hero 用**同一条规则**（`heroAction`），不在这里再写一遍判断。
        */}
        <Button
          asChild
          size="sm"
          variant={action.kind === "view" ? "outline" : "default"}
          className="mt-2 self-start"
        >
          <Link href={action.href}>{action.kind === "view" ? "查看详情" : action.label}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
