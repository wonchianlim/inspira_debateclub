import type { Metadata } from "next";
import "./globals.css";

/**
 * 注意：这里**刻意不使用** `next/font/google`。
 *
 * 原因（INSPIRA_DEEPSEEK_MASTER_SPEC.md 第 5.4 节）：
 * 生产页面的浏览器体验不得依赖未经大陆测试的境外域名。规范明确要求
 * "自托管字体，并在自托管品牌字体通过审核前使用系统字体"。
 *
 * 字体栈定义在 `app/globals.css` 的 `@theme inline` 中（`--font-sans`），
 * 并通过 `html { @apply font-sans }` 应用于整页，因此这里不需要任何字体导入。
 *
 * 注：`shadcn init` 默认会注入 Geist（`next/font/google`），已在 P1-2 中移除；
 * 并由自动化检查防止回归（见 tests/unit/no-third-party-assets.test.ts）。
 */
export const metadata: Metadata = {
  title: "INSPIRA 辩论俱乐部管理系统",
  description: "INSPIRA 每周辩论俱乐部的报名、配对、裁判与评分表管理平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
