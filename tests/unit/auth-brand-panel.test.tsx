import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthBrandPanel } from "@/components/layout/auth-brand-panel";
import { I18nProvider } from "@/lib/i18n/provider";
import { en } from "@/lib/i18n/messages/en";
import { zh } from "@/lib/i18n/messages/zh";

/**
 * 登录页的品牌面板（UI/UX 规范 §7.1）。
 *
 * 规范把这几行字逐行写了出来，所以这里逐行断言 ——
 * 它们是产品文案，不是可以随手改的实现细节。
 */

function renderPanel(locale: "en" | "zh" = "en") {
  return render(
    <I18nProvider locale={locale} messages={locale === "en" ? en : zh}>
      <AuthBrandPanel />
    </I18nProvider>,
  );
}

describe("品牌文案与规范一致", () => {
  it("英文（默认语言）就是规范给的那四句", () => {
    renderPanel("en");
    expect(screen.getByText("DEBATE CLUB")).toBeInTheDocument();
    expect(screen.getByText("Think clearly.")).toBeInTheDocument();
    expect(screen.getByText("Speak with purpose.")).toBeInTheDocument();
    expect(screen.getByText("Compete.")).toBeInTheDocument();
    expect(
      screen.getByText("Debate, judging, and feedback for the INSPIRA community."),
    ).toBeInTheDocument();
  });

  it("中文语言下给中文，而不是漏回英文", () => {
    renderPanel("zh");
    expect(screen.getByText("想清楚。")).toBeInTheDocument();
    expect(screen.queryByText("Think clearly.")).toBeNull();
  });
});

describe("无障碍", () => {
  it("这一块有可访问名称（屏幕阅读器知道它是一块区域）", () => {
    const { container } = renderPanel("en");
    const section = container.querySelector("section");
    expect(section).toHaveAttribute("aria-label", "INSPIRA Debate Club");
  });

  /**
   * ⚠️ 狮子是**装饰性**图片：旁边就有品牌名。
   * 给它写 alt="狮子" 会让屏幕阅读器念一遍没用的东西 ——
   * 空 alt + aria-hidden 才是对的（本项目在应用外壳上已经这么做过）。
   */
  it("装饰性的狮子图片对屏幕阅读器隐藏", () => {
    const { container } = renderPanel("en");
    const images = [...container.querySelectorAll("img")];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toHaveAttribute("alt", "");
      expect(image).toHaveAttribute("aria-hidden", "true");
    }
  });
});
