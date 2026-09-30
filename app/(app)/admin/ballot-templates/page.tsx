import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listBallotTemplates,
  listFormatsWithoutActiveTemplate,
} from "@/lib/admin/ballot-templates";
import { TEMPLATE_PERMISSION_NOTE } from "@/lib/validation/ballot-templates";
import { requireAnyRole } from "@/lib/auth/session";

import { TemplateForm, TemplateToggleButton } from "./template-form";

export const metadata = { title: "评分表模板 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function BallotTemplatesPage() {
  await requireAnyRole(["super_admin"]);

  const [templates, missingFormats] = await Promise.all([
    listBallotTemplates(),
    listFormatsWithoutActiveTemplate(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">评分表模板</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">返回管理</Link>
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">{TEMPLATE_PERMISSION_NOTE}</p>

      {missingFormats.length > 0 ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              这些赛制还没有评分表模板，裁判无法打分
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {missingFormats.map((format) => (
                <li key={format.formatId}>
                  <strong>{format.code}</strong> · {format.name}（{format.teamSize} 人一队）
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">
              每个赛制打哪几项、每项满分多少，需要你来定 —— 系统不会替你决定。
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-sm">所有赛制都已配置评分表模板。</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">新建模板版本</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm availableFormats={missingFormats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">现有模板（{templates.length}）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">还没有任何模板。</p>
          ) : (
            templates.map((template) => (
              <div key={template.templateId} className="border-border rounded-md border px-3 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{template.name}</strong>
                  <Badge variant="outline" className="font-normal">
                    {template.formatCode}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    第 {template.version} 版
                  </Badge>
                  {template.active ? (
                    <Badge variant="secondary" className="font-normal">
                      当前使用
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground text-xs">
                    {template.fieldCount} 个字段
                  </span>
                </div>
                <ul className="text-muted-foreground mb-2 flex flex-col gap-0.5 text-xs">
                  {template.schema.fields.map((field) => (
                    <li key={field.key}>
                      <code className="font-mono">{field.key}</code> · {field.label}
                      {field.type === "score"
                        ? ` · 分数 ${field.min ?? "?"}–${field.max ?? "?"}`
                        : ` · ${field.type === "text" ? "文字" : "是/否"}`}
                      {field.required ? " · 必填" : ""}
                      {` · ${field.scope === "speaker" ? "按学生" : field.scope === "team" ? "按队伍" : "整场"}`}
                    </li>
                  ))}
                </ul>
                <TemplateToggleButton templateId={template.templateId} active={template.active} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
