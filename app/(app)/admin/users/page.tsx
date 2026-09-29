import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listProfiles } from "@/lib/admin/users";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import {
  PROFILE_STATUSES,
  PROFILE_STATUS_LABELS,
  type ProfileStatus,
} from "@/lib/validation/admin";

export const metadata = { title: "用户管理 · INSPIRA" };

export const dynamic = "force-dynamic";

/** 把 URL 参数收敛成已知取值，避免把任意字符串直接当筛选条件用。 */
function parseFilters(params: { q?: string; status?: string; role?: string }) {
  const status = PROFILE_STATUSES.includes(params.status as ProfileStatus)
    ? (params.status as ProfileStatus)
    : undefined;
  const role = (APP_ROLES as readonly string[]).includes(params.role ?? "")
    ? (params.role as AppRole)
    : undefined;
  return { search: params.q?.slice(0, 100), status, role };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; role?: string }>;
}) {
  const rawParams = await searchParams;
  const filters = parseFilters(rawParams);
  const profiles = await listProfiles(filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">用户管理</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">返回系统管理</Link>
        </Button>
      </div>

      {/*
        筛选用**原生 GET 表单**而不是客户端组件：
        地址栏能看到筛选条件（可以分享/加书签），也不依赖 JavaScript。
      */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor="q">搜索</Label>
              <Input
                id="q"
                name="q"
                type="search"
                defaultValue={filters.search ?? ""}
                placeholder="姓名或邮箱"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">账号状态</Label>
              <select
                id="status"
                name="status"
                defaultValue={filters.status ?? ""}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
              >
                <option value="">全部</option>
                {PROFILE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PROFILE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">角色</Label>
              <select
                id="role"
                name="role"
                defaultValue={filters.role ?? ""}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
              >
                <option value="">全部</option>
                {APP_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit">筛选</Button>
            <Button asChild variant="ghost">
              <Link href="/admin/users">清除</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            共 {profiles.length} 个账号
            {profiles.length === 200 ? "（已达上限 200，请用筛选缩小范围）" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <StatePanel
              variant="empty"
              title="没有符合条件的账号"
              description="换一个搜索词，或清除筛选条件再看。"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">用户列表，包含姓名、邮箱、账号状态与角色</caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      姓名
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      邮箱
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      状态
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      角色
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="border-border border-b last:border-0">
                      <td className="py-3 pr-4">{profile.displayName}</td>
                      <td className="text-muted-foreground py-3 pr-4">{profile.email}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={profile.status === "active" ? "secondary" : "destructive"}>
                          {PROFILE_STATUS_LABELS[profile.status]}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {profile.roles.length === 0 ? (
                          <span className="text-muted-foreground">（无）</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {profile.roles.map((role) => (
                              <Badge key={role} variant="outline">
                                {ROLE_LABELS[role]}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/admin/users/${profile.id}`}
                          className="focus-visible:ring-ring/50 rounded underline focus-visible:ring-3"
                        >
                          管理
                        </Link>
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
