import { requireSession } from "@/lib/auth/session";
import { workspacesForRoles } from "@/lib/auth/roles";
import { getMessages } from "@/lib/i18n";
import { AppShell } from "@/components/layout/app-shell";
import { RoleNav } from "@/components/layout/role-nav";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

/**
 * 已登录区域的布局。
 *
 * 这里是**受保护路由的入口**：任何位于 `app/(app)/` 下的页面都必须先有会话。
 * 未登录会被重定向到 /login（主规格第 8 节允许"安全的 403 或跳转"）。
 *
 * ⚠️ 这只是"是否已登录"这一层。**具体角色的访问控制**由各区域的
 *    layout.tsx 调用 `requireAnyRole()` 完成——因为不同区域允许的角色不同。
 *
 * ⚠️ 这个检查是**服务端**的。客户端隐藏菜单只是改善体验，不能作为安全依据
 *    （docs/architecture.md 第 6 节）。
 */
export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const m = await getMessages();

  const workspaces = workspacesForRoles(session.roles, {
    overview: m.nav.overview,
    events: m.nav.events,
    notifications: m.nav.notifications,
    student: "Student",
    judge: "Judge",
    coach: "Coach",
    clubManagement: m.nav.clubManagement,
    admin: m.nav.admin,
  });

  return (
    <AppShell
      nav={<RoleNav workspaces={workspaces} />}
      userSlot={
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground hidden text-xs sm:inline">
            {session.displayName}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              {m.nav.signOut}
            </Button>
          </form>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
