import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { I18nProvider } from "@/lib/i18n/provider";
import { en } from "@/lib/i18n/messages/en";
import { zh } from "@/lib/i18n/messages/zh";

/**
 * 登录表单（UI/UX 规范 §7.1）。
 *
 * ⚠️ 这里覆盖的是一个**曾经不一致**的地方：整组 `auth` 文案早就躺在 i18n 字典里，
 * 一行都没被用过，而登录表单把中文写死在代码里 ——
 * 产品负责人选的**默认语言是英文**，于是"默认英文"的页面显示的是中文。
 */

function renderForm(locale: "en" | "zh" = "en") {
  return render(
    <I18nProvider locale={locale} messages={locale === "en" ? en : zh}>
      <LoginForm />
    </I18nProvider>,
  );
}

describe("文案来自字典，而不是写死在页面里", () => {
  it("默认语言（英文）下标签与按钮都是英文", () => {
    renderForm("en");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Forgot your password\?/ })).toBeInTheDocument();
  });

  it("中文语言下同一份组件给中文", () => {
    renderForm("zh");
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("每个字段都有持久可见的标签（规范 §13.5：不能只靠 placeholder）", () => {
    renderForm("en");
    for (const label of ["Email", "Password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});

describe("密码显示／隐藏（规范 §7.1 明确要求）", () => {
  it("默认是 password 类型，按钮标注「Show password」且 aria-pressed=false", () => {
    renderForm("en");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("点一下就变成明文，按钮文字与 aria-pressed 都跟着变", () => {
    renderForm("en");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    const toggle = screen.getByRole("button", { name: "Hide password" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    // 再点一次回到隐藏
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  /**
   * ⚠️ 这个按钮必须是 `type="button"`。
   * 如果它是默认的 `type="submit"`，裁判/学生"想看看自己输错了什么"
   * 就会变成**一次真实的登录尝试** —— 在有限流的情况下是实打实的伤害。
   */
  it("它是开关而不是提交按钮（点它不会提交表单）", () => {
    renderForm("en");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("type", "button");
  });
});
