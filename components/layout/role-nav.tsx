"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { RoleNavItem } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

/**
 * 按角色生成的导航。
 *
 * 为什么是客户端组件：布局（layout）拿不到当前路径，而 `aria-current` 需要
 * 依据路径判断。用 `usePathname()` 是标准做法。
 *
 * ⚠️ 这里**不是**安全措施。隐藏入口只是改善体验；能否访问某个区域，
 *    由该区域布局里的 `requireAnyRole()`（服务端）与数据库 RLS 决定。
 */
export function RoleNav({ items }: { items: RoleNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航">
      <ul className="flex flex-wrap items-center gap-1">
        {items.map((item) => {
          // /student 在 /student/xxx 下也应显示为当前项
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  // min-h-11 保证触控目标高度不低于 44px（移动端可点性）
                  "focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  current
                    ? "bg-muted text-foreground font-medium"
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
  );
}
