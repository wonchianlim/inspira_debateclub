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

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {/*
        工作区切换：**只在真的有多个时显示**。
        单角色用户看到这个只会多一行噪音 —— 规范 §1.4 原则 5「低视觉噪音」。
      */}
      {workspaces.length > 1 ? (
        <nav
          aria-label="Workspaces"
          className="border-border flex items-center gap-0.5 border-r pr-4"
        >
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
                    ? "bg-brand-tint text-brand-foreground/90 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {workspace.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <nav aria-label="Main navigation">
        <ul className="flex flex-wrap items-center gap-0.5">
          {active.items.map((item) => {
            const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
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
      </nav>
    </div>
  );
}
