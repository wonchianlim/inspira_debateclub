import Link from "next/link";

import { Button } from "@/components/ui/button";
import { describeEventLocation } from "@/lib/domain/event-location";
import { heroAction, type StudentHomeEvent } from "@/lib/domain/student-home";
import { utcToZonedLocal } from "@/lib/domain/timezone";

/**
 * 学生首页的「下一场」hero（UI/UX 规范 §8.1 第 1 节）。
 *
 * 规范要求它是一个**深蓝表面**，带活动标题、时间/时区、赛制、状态，
 * 一个主操作与一个次操作（`View event`）。
 *
 * 为什么单独成组件而不写在页面里：
 * 主按钮的动作由 `heroAction()` 决定（报名 / 签到 / 只看详情），
 * 那是一条规则；页面里再写一遍 `event.myRegistrationStatus === ...` 的三目，
 * 就会出现第二份真话。组件只消费那一条规则。
 *
 * ⚠️ 深蓝底上的文字对比度：深蓝 `#071B45` 配白字是 16.78:1（页面上最高的一组），
 * 因此这里不用次级灰字，只把说明文字降为 80% 透明度 —— 仍在 AA 之上。
 */
export function NextDebateHero({ event, now }: { event: StudentHomeEvent; now: Date }) {
  const action = heroAction(event, now);
  const localDateTime = (iso: string) =>
    utcToZonedLocal(new Date(iso), event.timezone).replace("T", " ");

  return (
    <section
      aria-labelledby="next-debate-heading"
      className="bg-primary text-primary-foreground rounded-lg px-5 py-5 md:px-6 md:py-6"
    >
      <p className="text-xs font-medium tracking-wide opacity-80">下一场</p>
      <h2 id="next-debate-heading" className="text-h3 mt-1 font-semibold">
        {event.title}
      </h2>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <dt className="text-xs opacity-80">时间（{event.timezone}）</dt>
          <dd>{localDateTime(event.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-80">报名截止</dt>
          <dd>{localDateTime(event.registrationClosesAt)}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-80">地点</dt>
          <dd>{describeEventLocation(event).label}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-80">赛制</dt>
          <dd>{event.enabledFormatCount} 个可选</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        {/*
          主按钮用 secondary（浅底深字）。规范 §5.2 明确禁止把品牌橙当装饰，
          所以这里不是为了"好看"加橙色 —— 深蓝底上已经不需要再用颜色抢注意力。
        */}
        <Button asChild variant="secondary">
          <Link href={action.href}>{action.label}</Link>
        </Button>
        <Link
          href={`/student/events/${event.id}`}
          className="focus-visible:ring-ring/50 rounded text-sm underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
        >
          查看活动详情
        </Link>
      </div>
    </section>
  );
}
