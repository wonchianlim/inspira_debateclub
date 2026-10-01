import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listBallotTemplates,
  listFormatsWithoutActiveTemplate,
} from "@/lib/admin/ballot-templates";
import { OFFICIAL_TEMPLATES } from "@/lib/domain/official-templates";
import { TEMPLATE_PERMISSION_NOTE } from "@/lib/validation/ballot-templates";
import { requireAnyRole } from "@/lib/auth/session";

import { SeedOfficialTemplatesButton, TemplateForm, TemplateToggleButton } from "./template-form";

export const metadata = { title: "评分表模板 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function BallotTemplatesPage() {
  await requireAnyRole(["super_admin"]);

  const [templates, formatState] = await Promise.all([
    listBallotTemplates(),
    listFormatsWithoutActiveTemplate(),
  ]);

  const missingFormats = formatState.missing;
  /*
   * ⚠️ 必须单独判断"一个赛制都没有"。
   *
   * 否则它会退化成 missingFormats.length === 0，
   * 页面就会在一个**空数据库**上说"所有赛制都已配置" ——
   * 生产上真的这样显示了，同时下拉框空白、模板列表为空。
   * 三个症状，同一个根因：db push 不执行 seed.sql。
   */
  const noFormatsAtAll = formatState.totalFormats === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">评分表模板</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">返回管理</Link>
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">{TEMPLATE_PERMISSION_NOTE}</p>

      {noFormatsAtAll ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-base">数据库里没有任何赛制</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              这是基础数据缺失 —— 五种赛制（PF / JWSD / WSDC / BP / ONE_V_ONE）
              应该在初始化数据库时写入。
            </p>
            <p className="text-muted-foreground">
              常见原因：<code>supabase db push</code> 只执行迁移，
              <strong>不会执行 seed.sql</strong>。请在 Supabase 的 SQL Editor 里 运行{" "}
              <code>supabase/seed.sql</code>，然后刷新本页。
            </p>
          </CardContent>
        </Card>
      ) : missingFormats.length > 0 ? (
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
            {/*
              官方内容已经在代码里（由产品负责人提供），这里提供一键写入，
              省掉逐项手工录入。没有官方内容的赛制仍可在下面手工配置。
            */}
            <div className="mt-3">
              <SeedOfficialTemplatesButton
                missingFormatCodes={missingFormats
                  .map((format) => format.code)
                  .filter((code) => code in OFFICIAL_TEMPLATES)}
              />
            </div>
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
                  <MetaChip>{template.formatCode}</MetaChip>
                  <MetaChip>第 {template.version} 版</MetaChip>
                  {/*
                    "当前使用"是**状态**（这个版本正在生效），
                    Active 家族 = 深蓝底白字，和现场看板的"进行中"同一语义。
                  */}
                  {template.active ? <StatusBadge tone="active">当前使用</StatusBadge> : null}
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
