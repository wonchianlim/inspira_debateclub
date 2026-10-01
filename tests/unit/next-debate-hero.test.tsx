import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NextDebateHero } from "@/components/domain/next-debate-hero";
import type { StudentHomeEvent } from "@/lib/domain/student-home";

/**
 * 学生首页的「下一场」hero（规范 §8.1 第 1 节）。
 *
 * 规范对它的要求是具体的：深蓝表面、活动标题、时间/时区、赛制、
 * 一个主操作 + 一个次操作。这里逐条断言。
 */

const NOW = new Date("2026-10-15T04:00:00Z");

const EVENT: StudentHomeEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "周五常规活动",
  status: "registration_open",
  // 刻意用一个与测试机（以及俱乐部）都不同的时区，
  // 这样"显示时间有没有用活动自己的时区"才是真的被验证了
  timezone: "America/New_York",
  enabledFormatCount: 3,
  startsAt: "2026-10-20T10:00:00Z",
  checkInOpensAt: "2026-10-20T09:00:00Z",
  registrationOpensAt: "2026-10-01T00:00:00Z",
  registrationClosesAt: "2026-10-18T00:00:00Z",
  myRegistrationStatus: null,
};

describe("hero 的内容与结构", () => {
  it("标题与「下一场」标记都在", () => {
    render(<NextDebateHero event={EVENT} now={NOW} />);
    expect(screen.getByText("下一场")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "周五常规活动" })).toBeInTheDocument();
  });

  it("时间按**活动自己的时区**显示（UTC 10:00 → 纽约 06:00）", () => {
    render(<NextDebateHero event={EVENT} now={NOW} />);
    expect(screen.getByText("2026-10-20 06:00")).toBeInTheDocument();
    // 顺带确认时区本身也写出来了，学生不会误以为是本地时间
    expect(screen.getByText("时间（America/New_York）")).toBeInTheDocument();
  });

  it("显示赛制数量（规范要求 hero 里有 format）", () => {
    render(<NextDebateHero event={EVENT} now={NOW} />);
    expect(screen.getByText("3 个可选")).toBeInTheDocument();
  });

  it("这一段有可访问名称 —— 屏幕阅读器能听出它是一块独立区域", () => {
    const { container } = render(<NextDebateHero event={EVENT} now={NOW} />);
    const section = container.querySelector("section");
    expect(section?.getAttribute("aria-labelledby")).toBe("next-debate-heading");
    expect(container.querySelector("#next-debate-heading")).not.toBeNull();
  });
});

describe("hero 的动作", () => {
  it("窗口开放且未报名时，主按钮是「去报名」并指向该活动的详情页", () => {
    render(<NextDebateHero event={EVENT} now={NOW} />);
    expect(screen.getByRole("link", { name: "去报名" })).toHaveAttribute(
      "href",
      `/student/events/${EVENT.id}`,
    );
  });

  it("已报名且签到开放时，主按钮变成「去签到」", () => {
    render(
      <NextDebateHero
        event={{
          ...EVENT,
          myRegistrationStatus: "registered",
          checkInOpensAt: "2026-10-15T00:00:00Z",
        }}
        now={NOW}
      />,
    );
    expect(screen.getByRole("link", { name: "去签到" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "去报名" })).toBeNull();
  });

  /**
   * ⚠️ 反向断言：**绝不能让 hero 指向学生端不存在的页面**。
   * 本项目有一条硬规则：导航只使用已存在的路由。
   * 如果将来有人把动作改成 `/rounds/...`、`/results`（规范里有，但还没建），
   * 这条会失败并提醒他先建页面。
   */
  it("主按钮与详情链接都只指向现有的学生端路由", () => {
    const { container } = render(
      <NextDebateHero
        event={{
          ...EVENT,
          myRegistrationStatus: "registered",
          checkInOpensAt: "2026-10-15T00:00:00Z",
        }}
        now={NOW}
      />,
    );
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `hero 指向了不存在的路由：${href}`).toMatch(/^\/student\/events\//);
    }
  });

  it("次操作「查看活动详情」始终存在（规范要求 View event）", () => {
    render(<NextDebateHero event={EVENT} now={NOW} />);
    expect(screen.getByRole("link", { name: "查看活动详情" })).toHaveAttribute(
      "href",
      `/student/events/${EVENT.id}`,
    );
  });
});
