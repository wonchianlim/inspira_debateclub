import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createUserSupabaseClient } from "@/lib/supabase/server";

export const metadata = { title: "仪表盘 · INSPIRA" };

export const dynamic = "force-dynamic";

/**
 * 仪表盘占位页。
 *
 * ⚠️ 这是 P1-8 的最小占位，只为让登录/注册后的跳转有落点。
 *    按角色的分流、导航与权限可见性属于 **P1-9**，将在那一步替换本页内容。
 */
export default async function DashboardPage() {
  const supabase = await createUserSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle>仪表盘</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>已登录：{user?.email ?? "（未登录）"}</p>
          <p>按角色的界面分流将在下一步（P1-9）完成。</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
