"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";

import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { useLocale, useMessages } from "@/lib/i18n/provider";

export type NavItem = {
  href: string;
  label: string;
  /** 当前所在页面，会输出 aria-current="page"（屏幕阅读器可感知） */
  current?: boolean;
};

/**
 * 应用外壳：语义化地标 + 跳过导航链接 + 响应式布局。
 *
 * 可访问性要点（依据规范第 13 节，WCAG 2.2 AA）：
 * - `<header>` / `<nav>` / `<main>` / `<footer>` 构成地标结构；
 * - 首个可聚焦元素是"跳到主要内容"，键盘用户可跳过导航；
 * - 所有可聚焦元素的焦点样式由 `focus-visible:ring-*` 显式给出，不依赖浏览器默认；
 * - 导航只使用已存在的路由，避免产生死链。
 *
 * 不传导航时不渲染 `<nav>`：认证页面等场景本来就没有可跳转的入口，
 * 渲染一个空的导航地标反而会干扰屏幕阅读器用户。
 */
export function AppShell({
  children,
  navItems,
  nav,
  userSlot,
}: {
  children: React.ReactNode;
  /** 静态导航项。若需要依据当前路径高亮，改用 `nav` 传入客户端组件。 */
  navItems?: NavItem[];
  /** 自定义导航节点（例如带 aria-current 的客户端导航）。优先于 navItems。 */
  nav?: React.ReactNode;
  /** 右上角区域，例如用户名与登出按钮。 */
  userSlot?: React.ReactNode;
}) {
  const m = useMessages();
  const locale = useLocale();

  const resolvedNav =
    nav ??
    (navItems && navItems.length > 0 ? (
      <nav aria-label={m.nav.mainNav}>
        <ul className="flex flex-wrap items-center gap-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                className={cn(
                  // min-h-11 保证触控目标高度不低于 44px（移动端可点性）
                  "focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  item.current
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    ) : null);

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main-content"
        className="focus:bg-background focus:ring-ring/50 sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-3 focus:outline-none"
      >
        {m.common.skipToContent}
      </a>

      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1">
          <Link
            href="/"
            className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-md focus-visible:ring-3 focus-visible:outline-none"
          >
            {/*
              官方狮子符号（VI 规范第 11.2 节「一级：官方品牌狮子」）。

              alt 留空 + aria-hidden：旁边就是品牌名，让屏幕阅读器再念一遍
              "INSPIRA 狮子图" 只是噪音。**装饰性图片就该这么处理** ——
              给它写 alt="狮子" 反而是错的。
            */}
            <Image
              src="/inspira-lion.png"
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              className="size-7 shrink-0"
              priority
            />
            {/* 标题用 Montserrat（VI 规范第 14 节） */}
            <span className="font-heading text-sm font-semibold tracking-tight">
              {m.common.appName}
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {resolvedNav}
            <LocaleSwitcher current={locale} label={m.nav.language} />
            {userSlot}
          </div>
        </div>
      </header>

      {/* tabIndex={-1} 让"跳到主要内容"链接能真正把焦点移进来 */}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 focus:outline-none"
      >
        {children}
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto w-full max-w-5xl px-4 py-6 text-xs">
          {/*
              ⚠️ 这里曾经写着「当前为 Phase 1 基础设施阶段」。

              那句话在 Phase 9 之后就不成立了，但页脚**没有任何测试会去看它**，
              于是在上线当天，**每一个页面**底下都挂着"当前是第一阶段"——
              包括已经能用的登录页。

              教训：**不要在常驻界面里写"当前进度"**。
              进度会变，而页脚不会有人回头改。
              现在只保留系统名称 —— 它任何时候都是对的。
            */}
          INSPIRA 辩论俱乐部管理系统
        </div>
      </footer>
    </div>
  );
}
