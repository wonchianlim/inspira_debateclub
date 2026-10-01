"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { type Workspace, activeWorkspace } from "@/lib/auth/roles";

/**
 * 角色感知导航（UI/UX 规范 §4.6）。
 *
 * ⚠️ 旧界面的问题是规范 §0.1 的原话：
 *   "A shallow header with Overview, Events, Notifications, Club Management,
 *    and System Management **shown together**."
 *
 * 四种角色的入口平铺在一行里，用户看不出自己此刻处于哪个身份下的工作流。
 * 一个既是裁判又是管理员的人，看到的是两套混在一起的菜单。
 *
 * 现在：**只显示当前工作区的导航**；有多个工作区时，先给一行工作区切换。
 *
 * ⚠️ 用 `usePathname()` 在客户端判断当前工作区，而不是在服务端读路径 ——
 * 服务端布局拿不到当前路径（Next.js 不提供），硬塞一个 header 反而更脆。
 */
export function RoleNav({ workspaces }: { workspaces: Workspace[] }) {
  const pathname = usePathname();
  const active = activeWorkspace(workspaces, pathname);

  /*
   * 移动端用 `<details>` 折叠导航（规范 §4.7）。
   *
   * ⚠️ 为什么用 `<details>` 而不是 `useState`：
   *   - **不需要 JS**。水合失败或 JS 未加载时菜单照样能用。
   *   - 原生就是键盘可操作的，`<summary>` 自带展开/收起语义，
   *     屏幕阅读器直接认得，不用自己补 aria-expanded。
   *   - 少一个客户端状态，就少一类"点了没反应"的问题。
   */
  const items = (
    <ul className="flex flex-col gap-0.5 md:flex-row md:flex-wrap md:items-center">
      {active.items.map((item) => {
        const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "focus-visible:ring-ring/50 flex min-h-11 items-center rounded-md px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
                isCurrent
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const workspacesNav =
    workspaces.length > 1 ? (
      <nav aria-label="Workspaces" className="flex flex-wrap items-center gap-0.5">
        {workspaces.map((workspace) => {
          const isCurrent = workspace.key === active.key;
          return (
            <Link
              key={workspace.key}
              href={workspace.href}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "focus-visible:ring-ring/50 inline-flex min-h-9 items-center rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none",
                isCurrent
                  ? "bg-brand-tint text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {workspace.label}
            </Link>
          );
        })}
      </nav>
    ) : null;

  return (
    <>
      {/* 桌面：工作区一行、导航一行，都在页头里 */}
      <div className="hidden items-center gap-x-4 md:flex">
        {workspaces.length > 1 ? (
          <div className="border-border border-r pr-4">{workspacesNav}</div>
        ) : null}
        <nav aria-label="Main navigation">{items}</nav>
      </div>

      {/* 移动：折叠成一个按钮，展开后两组都在里面 */}
      <details className="relative md:hidden">
        <summary
          className="border-border bg-background text-foreground focus-visible:ring-ring/50 flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 text-sm font-medium focus-visible:ring-3 focus-visible:outline-none"
          aria-label="Main navigation"
        >
          {active.label}
          <span aria-hidden="true" className="text-muted-foreground text-xs">
            ▾
          </span>
        </summary>
        <div className="bg-card border-border absolute right-0 z-50 mt-2 flex w-64 flex-col gap-3 rounded-lg border p-3 shadow-[var(--shadow-md)]">
          {workspacesNav}
          <nav aria-label="Main navigation">{items}</nav>
        </div>
      </details>
    </>
  );
}
