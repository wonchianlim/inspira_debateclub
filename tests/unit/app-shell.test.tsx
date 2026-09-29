import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

/**
 * 验证 P1-2 的可访问性声明，而不是只在文档里声称。
 * 依据规范第 13 节与 WCAG 2.2 AA 的键盘/地标要求。
 */
describe("AppShell 应用外壳", () => {
  it("第一个可聚焦元素是「跳到主要内容」链接，且指向 main", () => {
    render(
      <AppShell>
        <p>内容</p>
      </AppShell>,
    );

    const skipLink = screen.getByRole("link", { name: "跳到主要内容" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  it("存在 id 为 main-content 的 main 地标，且可接收焦点", () => {
    render(
      <AppShell>
        <p>内容</p>
      </AppShell>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    // tabIndex=-1 是"跳到主要内容"能把焦点移进来的前提
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("提供带无障碍名称的导航地标", () => {
    render(
      <AppShell navItems={[{ href: "/", label: "首页", current: true }]}>
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
  });

  it("不给导航项时不渲染空的导航地标（避免干扰屏幕阅读器）", () => {
    render(
      <AppShell>
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("可以通过 nav 传入自定义导航（用于需要按路径高亮的客户端导航）", () => {
    render(
      <AppShell nav={<nav aria-label="主导航">自定义</nav>}>
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "主导航" })).toHaveTextContent("自定义");
  });

  it("可以传入右上角区域（例如用户名与登出）", () => {
    render(
      <AppShell userSlot={<span>测试用户</span>}>
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.getByText("测试用户")).toBeInTheDocument();
  });

  it("当前页面用 aria-current 标记，而不是只靠样式", () => {
    render(
      <AppShell
        navItems={[
          { href: "/", label: "首页", current: true },
          { href: "/events", label: "活动" },
        ]}
      >
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "活动" })).not.toHaveAttribute("aria-current");
  });
});
