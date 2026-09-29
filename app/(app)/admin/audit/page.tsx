import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  listAuditEntries,
  listAuditFacets,
} from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

export const metadata = { title: "审计日志 · INSPIRA" };

export const dynamic = "force-dynamic";

/** 把前后值压成一行摘要。完整内容用 <details> 展开，避免表格被撑爆。 */
function summarise(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string }>;
}) {
  await requireAnyRole(AREA_ROLES.admin);
  const params = await searchParams;

  const [entries, facets] = await Promise.all([
    listAuditEntries({ entityType: params.entity, action: params.action }),
    listAuditFacets(),
  ]);

  const selectClass =
    "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">审计日志</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">返回系统管理</Link>
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        每一次特权改动都会自动留下记录（谁、什么时候、改了什么表、前后值）。 日志是
        <strong>只追加</strong>的：这里没有编辑或删除入口 —— 数据库层面也禁止，
        连超级管理员也改不了、删不了。
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entity">对象</Label>
              <select
                id="entity"
                name="entity"
                defaultValue={params.entity ?? ""}
                className={selectClass}
              >
                <option value="">全部</option>
                {facets.entityTypes.map((type) => (
                  <option key={type} value={type}>
                    {AUDIT_ENTITY_LABELS[type] ?? type}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="action">动作</Label>
              <select
                id="action"
                name="action"
                defaultValue={params.action ?? ""}
                className={selectClass}
              >
                <option value="">全部</option>
                {facets.actions.map((action) => (
                  <option key={action} value={action}>
                    {AUDIT_ACTION_LABELS[action] ?? action}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">筛选</Button>
            <Button asChild variant="ghost">
              <Link href="/admin/audit">清除</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            最近 {entries.length} 条记录
            {entries.length === 100 ? "（已达上限 100，请用筛选缩小范围）" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <StatePanel
              variant="empty"
              title="没有符合条件的记录"
              description="系统目前还没有产生审计记录，或当前筛选条件没有匹配项。"
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="border-border flex flex-col gap-1 border-b pb-3 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={entry.action === "delete" ? "destructive" : "outline"}>
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </Badge>
                    <span className="font-medium">
                      {AUDIT_ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {entry.actorName ?? "（系统操作，无操作者）"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {utcToZonedLocal(new Date(entry.createdAt), CLUB_DEFAULT_TIMEZONE).replace(
                        "T",
                        " ",
                      )}
                    </span>
                  </div>
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {entry.entityId}
                  </p>
                  {entry.oldValue !== null || entry.newValue !== null ? (
                    <details className="text-xs">
                      <summary className="text-muted-foreground cursor-pointer">查看前后值</summary>
                      <div className="mt-1 flex flex-col gap-1">
                        <p className="break-all">
                          <span className="text-muted-foreground">改前：</span>
                          {summarise(entry.oldValue)}
                        </p>
                        <p className="break-all">
                          <span className="text-muted-foreground">改后：</span>
                          {summarise(entry.newValue)}
                        </p>
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
