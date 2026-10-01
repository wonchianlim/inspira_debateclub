import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { eventStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { describeEventLocation } from "@/lib/domain/event-location";
import { EVENT_STATUS_LABELS } from "@/lib/domain/event-lifecycle";
import { heroAction, type StudentHomeEvent } from "@/lib/domain/student-home";
import { utcToZonedLocal } from "@/lib/domain/timezone";

/**
 * 活动详情页的 hero 摘要（UI/UX 规范 §8.3）。
 *
 * 规范原文：
 *   "Hero summary contains title, status, schedule, time zone, venue/link policy,
 *    formats, registration deadline, and role-specific CTA."
 *
 * ⚠️ 主按钮是**页面内的锚点**，不是链接到本页。
 * 在首页那个 hero 上，主按钮指向这个详情页（"去报名"→ 点进去报名）；
 * 但在这个页面上，报名按钮本身就在下面几节里 —— 如果这里再指一次当前网址，
 * 点了什么都不会发生。因此 hero 上的 CTA 跳到「我的报名」那一节，
 * 而**当学生没有可做的事时（`heroAction` 返回 view）就完全不显示 CTA**：
 * 显示一个什么都不做的按钮比不显示更糟。
 *
 * ⚠️ 深蓝表面上的颜色约束（规范 §5.2）：
 *   - 状态用 `StatusBadge`，它自带浅底深字，放在深蓝上仍然读得清；
 *   - 赛制用 `MetaChip` 并**覆盖**它的描边色与文字色 —— 默认的
 *     `text-foreground` 是深色，直接放在深蓝上会看不见。
 */
/** 给「我的报名」这一节用的锚点 id —— 页面与 hero 共用同一个常量，避免写歪。 */
export const MY_REGISTRATION_ANCHOR = "my-registration";

export type EventDetailHeroEvent = StudentHomeEvent & {
  eventDate: string;
  endsAt: string;
  enabledFormatCodes: string[];
};

export function EventDetailHero({ event, now }: { event: EventDetailHeroEvent; now: Date }) {
  const action = heroAction(event, now);
  const localDateTime = (iso: string) =>
    utcToZonedLocal(new Date(iso), event.timezone).replace("T", " ");

  return (
    <section
      aria-labelledby="event-hero-heading"
      className="bg-primary text-primary-foreground rounded-lg px-5 py-5 md:px-6 md:py-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* StatusBadge 自带浅底，因此在深蓝上依然清晰 */}
        <StatusBadge tone={eventStatusTone(event.status)}>
          {EVENT_STATUS_LABELS[event.status] ?? event.status}
        </StatusBadge>
        {event.enabledFormatCodes.map((code) => (
          <MetaChip key={code} className="border-primary-foreground/40 text-primary-foreground">
            {code}
          </MetaChip>
        ))}
      </div>

      <h1 id="event-hero-heading" className="text-h2 mt-3 font-semibold tracking-tight">
        {event.title}
      </h1>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-xs opacity-80">日期（{event.timezone}）</dt>
          <dd>{event.eventDate}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-80">时间</dt>
          <dd>
            {localDateTime(event.startsAt)} 至 {localDateTime(event.endsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs opacity-80">地点</dt>
          <dd>{describeEventLocation(event).label}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-80">报名截止</dt>
          <dd>{localDateTime(event.registrationClosesAt)}</dd>
        </div>
      </dl>

      {action.kind === "view" ? null : (
        <div className="mt-5">
          {/*
            锚点而不是按钮提交：真正的报名/签到按钮在「我的报名」那一节，
            这里只负责把学生送到那里。用 <a> 而不是 <Link>：
            同一页内的跳转交给浏览器处理即可，也不必经过客户端路由。
          */}
          <Button asChild variant="secondary">
            <a href={`#${MY_REGISTRATION_ANCHOR}`}>{action.label}</a>
          </Button>
        </div>
      )}
    </section>
  );
}

/** 内部链接（返回活动列表）用的次要操作，保持与 hero 同一行。 */
export function BackToEventsLink() {
  return (
    <Link
      href="/student/events"
      className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
    >
      返回活动列表
    </Link>
  );
}
