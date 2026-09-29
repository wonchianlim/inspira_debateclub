import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getScheduleOffsets, listSettings } from "@/lib/admin/settings";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

import { SettingsForm } from "./settings-form";

export const metadata = { title: "系统设置 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAnyRole(AREA_ROLES.admin);
  const [offsets, allSettings] = await Promise.all([getScheduleOffsets(), listSettings()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">系统设置</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">返回系统管理</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">活动时间安排默认值</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            规范没有规定这些数值，因此放在这里由你调整 ——{" "}
            <strong>不需要改代码，也不需要重新部署</strong>。
            新建活动时会用它们自动填好时间，管理员仍可以在每个活动上单独修改。
          </p>
          <SettingsForm current={offsets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前存储的设置</CardTitle>
        </CardHeader>
        <CardContent>
          {allSettings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              数据库里还没有任何设置项 —— 系统正在使用内置的默认值（报名提前 7 天开放、提前 1
              天截止、 签到提前 30 分钟、警示提前 10 分钟）。保存一次上面的表单就会写入。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">系统设置列表</caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      键
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      值
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      说明
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      最后更新
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allSettings.map((setting) => (
                    <tr key={setting.key} className="border-border border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{setting.key}</td>
                      <td className="py-2 pr-4">{JSON.stringify(setting.value)}</td>
                      <td className="text-muted-foreground py-2 pr-4 text-xs">
                        {setting.description ?? "—"}
                      </td>
                      <td className="text-muted-foreground py-2 text-xs">
                        {utcToZonedLocal(
                          new Date(setting.updatedAt),
                          CLUB_DEFAULT_TIMEZONE,
                        ).replace("T", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
