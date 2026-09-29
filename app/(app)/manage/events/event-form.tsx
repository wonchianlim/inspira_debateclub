"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEventAction, updateEventAction } from "@/lib/admin/event-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/** 常用时区。默认上海，与规范第 6.3 节的默认值一致。 */
const TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "中国标准时间（上海，UTC+8）" },
  { value: "Asia/Hong_Kong", label: "香港时间（UTC+8）" },
  { value: "Asia/Singapore", label: "新加坡时间（UTC+8）" },
  { value: "Asia/Taipei", label: "台北时间（UTC+8）" },
  { value: "UTC", label: "协调世界时（UTC）" },
] as const;

export type EventFormDefaults = {
  title: string;
  timezone: string;
  startsAtLocal: string;
  endsAtLocal: string;
  registrationOpensAtLocal: string;
  registrationClosesAtLocal: string;
  checkInOpensAtLocal: string;
  warningAtLocal: string;
  meetingUrl: string;
  notice: string;
};

/**
 * 活动表单（新建与编辑共用）。
 *
 * 设计要点：管理员只填**本地时间**，时区由活动本身决定。
 * `event_date` 不单独填写，由服务端按"开始时间在活动时区下的日期"推导 ——
 * 规范要求两者必须一致，让人手填极易出现"北京凌晨的活动日期差一天"。
 */
export function EventForm({
  mode,
  eventId,
  defaults,
}: {
  mode: "create" | "edit";
  eventId?: string;
  defaults: EventFormDefaults;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createEventAction : updateEventAction,
    INITIAL_FORM_STATE,
  );

  const error = (name: string) => state.fieldErrors?.[name]?.[0];

  /** 字段的通用渲染：标签 + 控件 + 错误。六个时间字段共用一套写法。 */
  function timeField(name: keyof EventFormDefaults, label: string, hint?: string) {
    const id = String(name);
    const message = error(name);
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          name={id}
          type="datetime-local"
          defaultValue={defaults[name]}
          required
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
        {hint && !message ? (
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            {hint}
          </p>
        ) : null}
        {message ? (
          <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">活动名称</Label>
        <Input
          id="title"
          name="title"
          defaultValue={defaults.title}
          required
          maxLength={120}
          aria-invalid={error("title") ? true : undefined}
          aria-describedby={error("title") ? "title-error" : undefined}
        />
        {error("title") ? (
          <p id="title-error" role="alert" className="text-destructive text-xs">
            {error("title")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">活动时区</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={defaults.timezone}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full max-w-sm rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
        >
          {TIMEZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          下面填写的时间都按这个时区理解。页面显示时会自动换算，不会因为服务器时区不同而出错。
        </p>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-sm font-medium">时间安排</legend>
        {timeField("startsAtLocal", "活动开始")}
        {timeField("endsAtLocal", "活动结束", "必须晚于开始时间。")}
        {timeField(
          "registrationOpensAtLocal",
          "报名开放",
          "已按系统设置里的默认偏移量填好，可以按本次活动的实际情况修改。",
        )}
        {timeField(
          "registrationClosesAtLocal",
          "报名截止",
          "必须晚于报名开放，且不能晚于活动开始。",
        )}
        {timeField("checkInOpensAtLocal", "签到开放", "规范默认是活动开始前 30 分钟。")}
        {timeField("warningAtLocal", "警示时间", "到达这个时间后，现场看板会标出还没到齐的房间。")}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meetingUrl">会议链接（可选）</Label>
        <Input
          id="meetingUrl"
          name="meetingUrl"
          type="url"
          defaultValue={defaults.meetingUrl}
          placeholder="https://"
          aria-invalid={error("meetingUrl") ? true : undefined}
          aria-describedby={error("meetingUrl") ? "meetingUrl-error" : "meetingUrl-hint"}
        />
        {error("meetingUrl") ? (
          <p id="meetingUrl-error" role="alert" className="text-destructive text-xs">
            {error("meetingUrl")}
          </p>
        ) : (
          <p id="meetingUrl-hint" className="text-muted-foreground text-xs">
            线上活动填写；只允许 http:// 或 https:// 开头的地址。
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notice">活动说明（可选）</Label>
        <textarea
          id="notice"
          name="notice"
          defaultValue={defaults.notice}
          rows={4}
          maxLength={2000}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
        />
        <p className="text-muted-foreground text-xs">会显示在活动页面上，最多 2000 字。</p>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : mode === "create" ? "创建活动" : "保存修改"}
      </Button>
    </form>
  );
}
