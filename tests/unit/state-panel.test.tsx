import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatePanel, type StateVariant } from "@/components/domain/state-panel";

/**
 * 验证规范第 13 节的两条硬性要求：
 *   1. 五种状态都必须有明确表现（加载、空、错误、无权限、成功）；
 *   2. **绝不只靠颜色**表达状态——每个状态必须同时有图标与文字。
 */
const VARIANTS: StateVariant[] = ["loading", "empty", "error", "unauthorized", "success"];

describe("StatePanel 页面状态", () => {
  it.each(VARIANTS)("%s 状态同时呈现图标与文字（不依赖颜色）", (variant) => {
    const { container } = render(<StatePanel variant={variant} />);

    // 有文字标题
    const text = container.querySelector("p");
    expect(text?.textContent?.trim().length ?? 0).toBeGreaterThan(0);

    // 有装饰性图标（对屏幕阅读器隐藏，避免重复播报）
    const icon = container.querySelector("svg[aria-hidden='true']");
    expect(icon).not.toBeNull();
  });

  it.each(VARIANTS)("%s 状态带有可用于测试与调试的 data-state", (variant) => {
    render(<StatePanel variant={variant} />);
    expect(
      screen.getByRole(variant === "error" || variant === "unauthorized" ? "alert" : "status"),
    ).toHaveAttribute("data-state", variant);
  });

  it("错误与无权限使用 role=alert（立即播报）", () => {
    for (const variant of ["error", "unauthorized"] as const) {
      const { unmount } = render(<StatePanel variant={variant} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      unmount();
    }
  });

  it("加载中、空、成功使用 role=status（礼貌播报）", () => {
    for (const variant of ["loading", "empty", "success"] as const) {
      const { unmount } = render(<StatePanel variant={variant} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
      unmount();
    }
  });

  it("接受自定义标题与操作按钮", () => {
    render(
      <StatePanel
        variant="empty"
        title="还没有活动"
        description="创建第一个活动后会显示在这里"
        action={<button type="button">新建活动</button>}
      />,
    );

    expect(screen.getByText("还没有活动")).toBeInTheDocument();
    expect(screen.getByText("创建第一个活动后会显示在这里")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建活动" })).toBeInTheDocument();
  });
});
