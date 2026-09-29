"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createNoticeAction, updateNoticeAction } from "@/lib/admin/notice-actions";
import { APP_ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import {
  NOTICE_AUDIENCES,
  NOTICE_AUDIENCE_DESCRIPTIONS,
  NOTICE_AUDIENCE_LABELS,
  PUBLISH_MODES,
  type NoticeAudience,
} from "@/lib/validation/notices";

const PUBLISH_MODE_LABELS: Record<(typeof PUBLISH_MODES)[number], string> = {
  draft: "先存草稿（只有管理员能看到）",
  now: "立即发布",
  scheduled: "定时发布",
};

export type NoticeFormDefaults = {
  title: string;
  body: string;
  audienceType: NoticeAudience;
  eventId: string;
  role: string;
  formatId: string;
  publishMode: (typeof PUBLISH_MODES)[number];
  publishedAtLocal: string;
  expiresAtLocal: string;
  timezone: string;
};

export function NoticeForm({
  mode,
  noticeId,
  defaults,
  eventOptions,
  formatOptions,
}: {
  mode: "create" | "edit";
  noticeId?: string;
  defaults: NoticeFormDefaults;
  eventOptions: { id: string; title: string }[];
  formatOptions: { id: string; code: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createNoticeAction : updateNoticeAction,
    INITIAL_FORM_STATE,
  );
  // 受众类型用受控状态：切换时要显示/隐藏对应的目标选择框
  const [audience, setAudience] = useState<NoticeAudience>(defaults.audienceType);
  const [publishMode, setPublishMode] = useState(defaults.publishMode);

  const error = (name: string) => state.fieldErrors?.[name]?.[0];
  const selectClass =
    "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full max-w-md rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50";

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {noticeId ? <input type="hidden" name="noticeId" value={noticeId} /> : null}
      <input type="hidden" name="timezone" value={defaults.timezone} />
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          name="title"
          defaultValue={defaults.title}
          required
          maxLength={200}
          disabled={pending}
          aria-invalid={error("title") ? true : undefined}
        />
        {error("title") ? (
          <p role="alert" className="text-destructive text-xs">
            {error("title")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="body">内容</Label>
        <textarea
          id="body"
          name="body"
          defaultValue={defaults.body}
          rows={8}
          maxLength={5000}
          required
          disabled={pending}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audienceType">接收对象</Label>
        <select
          id="audienceType"
          name="audienceType"
          value={audience}
          onChange={(event) => setAudience(event.target.value as NoticeAudience)}
          disabled={pending}
          aria-describedby="audience-hint"
          className={selectClass}
        >
          {NOTICE_AUDIENCES.map((value) => (
            <option key={value} value={value}>
              {NOTICE_AUDIENCE_LABELS[value]}
            </option>
          ))}
        </select>
        <p id="audience-hint" className="text-muted-foreground text-xs">
          {NOTICE_AUDIENCE_DESCRIPTIONS[audience]}
        </p>
      </div>

      {/*
        目标选择框只显示与当前受众类型相关的那一个。
        不同受众用**不同的 name**，因此不会互相干扰；
        服务端会把不相关的那几列强制写成 NULL（数据库 CHECK 会验证）。
      */}
      {audience === "event" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="eventId">活动</Label>
          <select
            id="eventId"
            name="eventId"
            defaultValue={defaults.eventId}
            disabled={pending}
            className={selectClass}
          >
            <option value="">请选择活动</option>
            {eventOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
          {error("eventId") ? (
            <p role="alert" className="text-destructive text-xs">
              {error("eventId")}
            </p>
          ) : null}
        </div>
      ) : null}

      {audience === "role" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">角色</Label>
          <select
            id="role"
            name="role"
            defaultValue={defaults.role}
            disabled={pending}
            className={selectClass}
          >
            <option value="">请选择角色</option>
            {APP_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {error("role") ? (
            <p role="alert" className="text-destructive text-xs">
              {error("role")}
            </p>
          ) : null}
        </div>
      ) : null}

      {audience === "format" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="formatId">赛制</Label>
          <select
            id="formatId"
            name="formatId"
            defaultValue={defaults.formatId}
            disabled={pending}
            className={selectClass}
          >
            <option value="">请选择赛制</option>
            {formatOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} · {option.name}
              </option>
            ))}
          </select>
          {error("formatId") ? (
            <p role="alert" className="text-destructive text-xs">
              {error("formatId")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="publishMode">发布方式</Label>
        <select
          id="publishMode"
          name="publishMode"
          value={publishMode}
          onChange={(event) =>
            setPublishMode(event.target.value as NoticeFormDefaults["publishMode"])
          }
          disabled={pending}
          className={selectClass}
        >
          {PUBLISH_MODES.map((value) => (
            <option key={value} value={value}>
              {PUBLISH_MODE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {publishMode === "scheduled" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="publishedAtLocal">发布时间（{defaults.timezone}）</Label>
          <Input
            id="publishedAtLocal"
            name="publishedAtLocal"
            type="datetime-local"
            defaultValue={defaults.publishedAtLocal}
            disabled={pending}
          />
          {error("publishedAtLocal") ? (
            <p role="alert" className="text-destructive text-xs">
              {error("publishedAtLocal")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expiresAtLocal">过期时间（可选，{defaults.timezone}）</Label>
        <Input
          id="expiresAtLocal"
          name="expiresAtLocal"
          type="datetime-local"
          defaultValue={defaults.expiresAtLocal}
          disabled={pending}
        />
        <p className="text-muted-foreground text-xs">
          留空表示不过期。过期后普通用户不再看到这条通知。
        </p>
        {error("expiresAtLocal") ? (
          <p role="alert" className="text-destructive text-xs">
            {error("expiresAtLocal")}
          </p>
        ) : null}
      </div>

      <div className="border-border text-muted-foreground rounded-md border px-3 py-2 text-xs">
        ⚠️ 本阶段的通知只出现在系统内部（登录后可见）。
        <strong>电子邮件投递将在 Phase 9 实现</strong> —— 发布通知<strong>不会</strong>
        立刻发邮件给任何人。
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : mode === "create" ? "创建通知" : "保存修改"}
      </Button>
    </form>
  );
}
