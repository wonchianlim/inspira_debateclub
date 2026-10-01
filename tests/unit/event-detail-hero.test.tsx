import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventDetailHero, type EventDetailHeroEvent } from "@/components/domain/event-detail-hero";

/**
 * 活动详情页的 hero 摘要（规范 §8.3）。
 *
 * 规范原文："Hero summary contains title, status, schedule, time zone,
 * venue/link policy, formats, registration deadline, and role-specific CTA."
 * 这里逐条断言。
 */

const NOW = new Date("2026-10-15T04:00:00Z");

const EVENT: EventDetailHeroEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "周五常规活动",
  status: "registration_open",
  // 刻意用与测试机不同的时区，这样"时间有没有按活动时区显示"才是真被验证的
  timezone: "America/New_York",
  eventDate: "2026-10-20",
  startsAt: "2026-10-20T10:00:00Z",
  endsAt: "2026-10-20T13:00:00Z",
  checkInOpensAt: "2026-10-20T09:00:00Z",
  registrationOpensAt: "2026-10-01T00:00:00Z",
  registrationClosesAt: "2026-10-18T00:00:00Z",
  enabledFormatCount: 2,
  enabledFormatCodes: ["PF", "BP"],
  venue: "教学楼 A101",
  meetingUrl: null,
  myRegistrationStatus: null,
};

describe("hero 摘要的内容（规范 §8.3 逐条）", () => {
  it("标题是一级标题", () => {
    render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(screen.getByRole("heading", { level: 1, name: "周五常规活动" })).toBeInTheDocument();
  });

  it("状态用中文名显示（不把数据库枚举值暴露给学生）", () => {
    render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(screen.getByText("报名开放中")).toBeInTheDocument();
  });

  it("日期、时间、时区都在，并按活动时区换算（UTC 10:00 → 纽约 06:00）", () => {
    render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(screen.getByText("日期（America/New_York）")).toBeInTheDocument();
    expect(screen.getByText("2026-10-20")).toBeInTheDocument();
    expect(screen.getByText("2026-10-20 06:00 至 2026-10-20 09:00")).toBeInTheDocument();
  });

  it("地点用统一的规则显示", () => {
    render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(screen.getByText("教学楼 A101")).toBeInTheDocument();
  });

  it("线上活动显示「线上」而不是场地", () => {
    render(
      <EventDetailHero
        event={{ ...EVENT, venue: null, meetingUrl: "https://x.invalid" }}
        now={NOW}
      />,
    );
    expect(screen.getByText("线上")).toBeInTheDocument();
  });

  it("赛制逐个列出", () => {
    render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(screen.getByText("PF")).toBeInTheDocument();
    expect(screen.getByText("BP")).toBeInTheDocument();
  });

  it("显示报名截止", () => {
    render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(screen.getByText("报名截止")).toBeInTheDocument();
    expect(screen.getByText("2026-10-17 20:00")).toBeInTheDocument();
  });

  it("这一段有可访问名称", () => {
    const { container } = render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(container.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      "event-hero-heading",
    );
    expect(container.querySelector("#event-hero-heading")).not.toBeNull();
  });
});

describe("hero 的主操作（规范 §8.3：role-specific CTA）", () => {
  it("还能报名时显示「去报名」，而且跳到**本页的报名区**，不是跳到本页自己", () => {
    render(<EventDetailHero event={EVENT} now={NOW} />);
    expect(screen.getByRole("link", { name: "去报名" })).toHaveAttribute(
      "href",
      "#my-registration",
    );
  });

  it("已报名且签到开放时变成「去签到」", () => {
    render(
      <EventDetailHero
        event={{
          ...EVENT,
          myRegistrationStatus: "registered",
          checkInOpensAt: "2026-10-15T00:00:00Z",
        }}
        now={NOW}
      />,
    );
    expect(screen.getByRole("link", { name: "去签到" })).toHaveAttribute(
      "href",
      "#my-registration",
    );
  });

  /**
   * ⚠️ 反向断言：**没有可做的事时不能显示按钮**。
   * 一个点了什么都不会发生的按钮，比没有按钮更糟。
   */
  it("已签到时**不显示**任何 CTA（没有可做的事）", () => {
    render(<EventDetailHero event={{ ...EVENT, myRegistrationStatus: "checked_in" }} now={NOW} />);
    expect(screen.queryByRole("link", { name: "去报名" })).toBeNull();
    expect(screen.queryByRole("link", { name: "去签到" })).toBeNull();
    expect(screen.queryByRole("link", { name: "查看活动" })).toBeNull();
  });

  it("报名窗口已关闭且我未报名时也不显示 CTA", () => {
    render(
      <EventDetailHero
        event={{ ...EVENT, registrationClosesAt: "2026-10-01T00:00:00Z" }}
        now={NOW}
      />,
    );
    expect(screen.queryByRole("link", { name: "去报名" })).toBeNull();
  });

  it("hero 里不会有指回本页的链接（那等于点了没反应）", () => {
    const { container } = render(<EventDetailHero event={EVENT} now={NOW} />);
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    for (const href of hrefs) {
      expect(href, `hero 里出现了指回本页的链接：${href}`).not.toBe(`/student/events/${EVENT.id}`);
    }
  });
});
