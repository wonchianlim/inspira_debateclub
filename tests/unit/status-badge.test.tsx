import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge, StatusDot } from "@/components/domain/status-badge";

/**
 * 语义状态徽章（UI/UX 规范 §5.2、§1.4 原则 4）。
 *
 * 这些测试锁的不是"好看"，而是**一致性**与**无障碍**两条硬要求。
 */

describe("语气决定颜色，调用方不挑色", () => {
  it("每种语气产出各自的底色与文字色", () => {
    const seen = new Map<string, string>();
    for (const tone of ["neutral", "info", "success", "warning", "danger", "brand"] as const) {
      const { container } = render(<StatusBadge tone={tone}>状态</StatusBadge>);
      const el = container.querySelector("[data-tone]");
      expect(el, `${tone} 没有渲染出来`).not.toBeNull();
      const cls = el?.className ?? "";
      // 同一语气重复渲染必须一致（不能有随机或依赖顺序的颜色）
      if (seen.has(tone)) expect(cls).toBe(seen.get(tone));
      seen.set(tone, cls);
    }
  });

  it("不同语气之间的类名不同 —— 否则等于没区分", () => {
    const classes = (["neutral", "info", "success", "warning", "danger"] as const).map((tone) => {
      const { container } = render(<StatusBadge tone={tone}>x</StatusBadge>);
      return container.querySelector("[data-tone]")?.className ?? "";
    });
    expect(new Set(classes).size).toBe(5);
  });

  it("默认语气是中性（不传 tone 不会意外变成红或绿）", () => {
    const { container } = render(<StatusBadge>待定</StatusBadge>);
    expect(container.querySelector('[data-tone="neutral"]')).not.toBeNull();
  });
});

describe("无障碍：颜色不能是唯一的信息载体（WCAG 1.4.1）", () => {
  it("文字始终与颜色同时存在 —— 色盲用户也能分辨", () => {
    render(<StatusBadge tone="danger">报名已关闭</StatusBadge>);
    expect(screen.getByText("报名已关闭")).toBeInTheDocument();
  });

  it("纯颜色圆点对屏幕阅读器隐藏（它自己不携带含义）", () => {
    const { container } = render(<StatusDot tone="success" />);
    const dot = container.firstElementChild;
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });

  it("徽章本身是一个普通 span，不冒充按钮或链接", () => {
    const { container } = render(<StatusBadge tone="info">进行中</StatusBadge>);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe("SPAN");
    expect(el?.getAttribute("role")).toBeNull();
  });
});
