"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBallotTemplateAction,
  seedOfficialTemplatesAction,
  toggleBallotTemplateAction,
} from "@/lib/admin/ballot-template-actions";
import type { FormatWithoutTemplate } from "@/lib/admin/ballot-templates";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/**
 * 新建评分表模板。
 *
 * 设计取舍：**不做成"填 JSON"**。
 *
 * 产品负责人是初学者，而模板决定之后所有裁判能打哪些分。
 * 让人手写 JSON 会把最容易出错的部分（格式）暴露给最不该操心格式的人。
 * 因此做成**逐行增删的表格**，JSON 由这个组件在提交前生成。
 *
 * 另一处刻意的地方：**分数字段的区间必须自己填**，没有默认值。
 * "满分是 30 还是 100"是各赛制的规则，系统不能替产品负责人决定。
 */

type FieldRow = {
  key: string;
  label: string;
  type: "score" | "text" | "boolean";
  scope: "speaker" | "team" | "match";
  required: boolean;
  min: string;
  max: string;
};

const EMPTY_ROW: FieldRow = {
  key: "",
  label: "",
  type: "score",
  scope: "speaker",
  required: true,
  min: "",
  max: "",
};

export function TemplateForm({ availableFormats }: { availableFormats: FormatWithoutTemplate[] }) {
  const [state, formAction, pending] = useActionState(
    createBallotTemplateAction,
    INITIAL_FORM_STATE,
  );
  const [rows, setRows] = useState<FieldRow[]>([{ ...EMPTY_ROW }]);

  const update = (index: number, patch: Partial<FieldRow>) => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  const fieldsJson = JSON.stringify(
    rows
      .filter((row) => row.key.trim() !== "" || row.label.trim() !== "")
      .map((row) => ({
        key: row.key.trim(),
        label: row.label.trim(),
        type: row.type,
        scope: row.scope,
        required: row.required,
        ...(row.type === "score"
          ? {
              min: row.min === "" ? undefined : Number(row.min),
              max: row.max === "" ? undefined : Number(row.max),
            }
          : {}),
      })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage status={state.status} message={state.message} />
      <input type="hidden" name="fieldsJson" value={fieldsJson} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="formatId">赛制</Label>
        <select
          id="formatId"
          name="formatId"
          required
          disabled={pending}
          className="border-input bg-background h-9 max-w-72 rounded-md border px-2 text-sm"
        >
          {availableFormats.map((format) => (
            <option key={format.formatId} value={format.formatId}>
              {format.code} · {format.name}
            </option>
          ))}
        </select>
        {availableFormats.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            所有赛制都已有模板。再保存会为该赛制**新建一个版本**（旧版本保留）。
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">模板名称</Label>
        <Input id="name" name="name" required disabled={pending} className="max-w-72" />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">评分项</legend>
        <p className="text-muted-foreground text-xs">
          每个赛制打哪几项、每项满分多少由你决定。分数字段**必须**填写最小值和最大值 ——
          系统不会替你决定满分是 30 还是 100。
        </p>

        {rows.map((row, index) => (
          <div
            key={index}
            className="border-border flex flex-col gap-2 rounded-md border px-3 py-3"
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`key-${index}`} className="text-xs">
                  字段键（英文字母，用于存储）
                </Label>
                <Input
                  id={`key-${index}`}
                  value={row.key}
                  disabled={pending}
                  placeholder="content"
                  className="w-40 font-mono"
                  onChange={(event) => update(index, { key: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`label-${index}`} className="text-xs">
                  显示名称（裁判看到的）
                </Label>
                <Input
                  id={`label-${index}`}
                  value={row.label}
                  disabled={pending}
                  placeholder="内容"
                  className="w-40"
                  onChange={(event) => update(index, { label: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`type-${index}`} className="text-xs">
                  类型
                </Label>
                <select
                  id={`type-${index}`}
                  value={row.type}
                  disabled={pending}
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  onChange={(event) =>
                    update(index, { type: event.target.value as FieldRow["type"] })
                  }
                >
                  <option value="score">分数</option>
                  <option value="text">文字</option>
                  <option value="boolean">是 / 否</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`scope-${index}`} className="text-xs">
                  作用于
                </Label>
                <select
                  id={`scope-${index}`}
                  value={row.scope}
                  disabled={pending}
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  onChange={(event) =>
                    update(index, { scope: event.target.value as FieldRow["scope"] })
                  }
                >
                  <option value="speaker">每位学生</option>
                  <option value="team">每支队伍</option>
                  <option value="match">整场比赛</option>
                </select>
              </div>

              {row.type === "score" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`min-${index}`} className="text-xs">
                      最低分
                    </Label>
                    <Input
                      id={`min-${index}`}
                      type="number"
                      value={row.min}
                      disabled={pending}
                      className="w-24"
                      onChange={(event) => update(index, { min: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`max-${index}`} className="text-xs">
                      满分
                    </Label>
                    <Input
                      id={`max-${index}`}
                      type="number"
                      value={row.max}
                      disabled={pending}
                      className="w-24"
                      onChange={(event) => update(index, { max: event.target.value })}
                    />
                  </div>
                </>
              ) : null}

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={row.required}
                  disabled={pending}
                  onChange={(event) => update(index, { required: event.target.checked })}
                  className="accent-primary size-4"
                />
                必填
              </label>

              {rows.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  删除这一项
                </Button>
              ) : null}
            </div>
          </div>
        ))}

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className="self-start"
          onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
        >
          再加一项
        </Button>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="winnerRequired"
            defaultChecked
            disabled={pending}
            className="accent-primary size-4"
          />
          必须选出胜方
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="reasonForDecisionRequired"
            defaultChecked
            disabled={pending}
            className="accent-primary size-4"
          />
          必须填写判决理由
        </label>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : "保存为新版本"}
      </Button>
    </form>
  );
}

/** 启用 / 停用某个模板版本。 */
export function TemplateToggleButton({
  templateId,
  active,
}: {
  templateId: string;
  active: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    toggleBallotTemplateAction,
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" size="sm" variant={active ? "ghost" : "outline"} disabled={pending}>
        {pending ? "…" : active ? "停用" : "设为该赛制当前使用"}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/**
 * "载入官方模板"按钮。
 *
 * 产品负责人已经把 1v1 / JWSD / WSDC / PF 的评分表内容给了我，
 * 但那些内容在代码里、还没进数据库。这个按钮把它们写进去，
 * 省掉手工逐项录入 —— 那不是产品负责人该花时间的地方。
 *
 * ⚠️ 幂等：已经有模板的赛制会被跳过，重复点击安全。
 */
export function SeedOfficialTemplatesButton({
  missingFormatCodes,
}: {
  missingFormatCodes: string[];
}) {
  /*
   * 这个动作不需要表单输入，但 `useActionState` 要求 `(state, formData)` 签名，
   * 因此在这里薄薄地包一层，而不是给动作加上两个用不到的参数
   * （那会被 lint 判为未使用，也会让动作的意图变模糊）。
   */
  const [state, formAction, pending] = useActionState(
    async () => seedOfficialTemplatesAction(),
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        {pending ? "载入中…" : "载入官方模板"}
      </Button>
      <p className="text-muted-foreground text-xs">
        {missingFormatCodes.length > 0
          ? `可以自动载入：${missingFormatCodes.join("、")}。其余赛制尚无官方内容，仍可在下面手工配置。`
          : "四个官方模板都已载入。再点一次是安全的（已配置的会被跳过）。"}
      </p>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
