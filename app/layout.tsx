import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * 品牌字体（依 INSPIRA_Brand_VI_Brief 第 14 节）。
 *
 * ⚠️ 字体文件**放在仓库里**（app/fonts/，6 个字重共约 72 KB），
 * 用 `next/font/local` 引用。
 *
 * 为什么**不用** `next/font/google`：
 *   它虽然也把字体自托管到我们自己的域名，但**构建时要连 Google** ——
 *   对一个在大陆构建的项目，那意味着构建会失败。
 *   项目里有守卫测试禁止源码出现 `next/font/google`
 *   （tests/unit/no-third-party-assets.test.ts），这个决定是对的。
 *
 * 授权：Montserrat 与 Inter 均为 SIL Open Font License 1.1，
 * 允许自托管与商用。字体文件只取 latin 子集。
 *
 * ⚠️ 中文**不**用网页字体：Noto Sans SC 完整 CJK 有数 MB。
 * 中文走系统字体栈（PingFang SC / 微软雅黑），见 globals.css。
 * 拉丁字母用 Inter/Montserrat，中文自动回落 —— 中英混排的标准做法。
 */
const inter = localFont({
  src: [
    { path: "./fonts/inter-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang SC", "Microsoft YaHei"],
});

const montserrat = localFont({
  src: [
    { path: "./fonts/montserrat-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/montserrat-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
  fallback: ["Inter", "-apple-system", "PingFang SC", "Microsoft YaHei"],
});

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
    <html lang="zh-CN" className={`${inter.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
