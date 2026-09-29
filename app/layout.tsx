import type { Metadata } from "next";
import "./globals.css";

/**
 * 注意：这里**刻意不使用** `next/font/google`。
 *
 * 原因（INSPIRA_DEEPSEEK_MASTER_SPEC.md 第 5.4 节）：
 * 生产页面的浏览器体验不得依赖未经大陆测试的境外域名。规范明确要求
 * "自托管字体，并在自托管品牌字体通过审核前使用系统字体"。
 * `next/font/google` 会在构建时访问 Google 并依赖其字体文件，
 * 因此 V1 一律使用系统字体栈（见 globals.css 的 --font-sans）。
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
