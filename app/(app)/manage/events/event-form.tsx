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
  { value: "Asia/Shanghai", label: "China Standard Time (Shanghai, UTC+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time (UTC+8)" },
  { value: "Asia/Singapore", label: "Singapore Time (UTC+8)" },
  { value: "Asia/Taipei", label: "Taipei Time (UTC+8)" },
  { value: "UTC", label: "Coordinated Universal Time (UTC)" },
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
  venue: string;
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
        <Label htmlFor="title">Event name</Label>
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
        <Label htmlFor="timezone">Event time zone</Label>
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
          All times below are read in this time zone. They are converted for display, so a different
          server time zone cannot shift them.
        </p>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-sm font-medium">Schedule</legend>
        {timeField("startsAtLocal", "Starts")}
        {timeField("endsAtLocal", "Ends", "Must be later than the start time.")}
        {timeField(
          "registrationOpensAtLocal",
          "Registration opens",
          "Prefilled from the offsets in Settings. Change it if this event differs.",
        )}
        {timeField(
          "registrationClosesAtLocal",
          "Registration closes",
          "Must be later than registration opens, and no later than the start time.",
        )}
        {timeField(
          "checkInOpensAtLocal",
          "Check-in opens",
          "Default is 30 minutes before the event starts.",
        )}
        {timeField(
          "warningAtLocal",
          "Warning time",
          "After this time the live board flags rooms that are not complete.",
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meetingUrl">Meeting link (optional)</Label>
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
            For online events. Must start with http:// or https://.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="venue">Venue (optional)</Label>
        <Input
          id="venue"
          name="venue"
          defaultValue={defaults.venue}
          maxLength={200}
          placeholder="e.g. Teaching Building A101"
          aria-invalid={error("venue") ? true : undefined}
          aria-describedby={error("venue") ? "venue-error" : "venue-hint"}
        />
        {error("venue") ? (
          <p id="venue-error" role="alert" className="text-destructive text-xs">
            {error("venue")}
          </p>
        ) : (
          <p id="venue-hint" className="text-muted-foreground text-xs">
            For in-person events. Leave it blank for online events and fill in the meeting link
            instead. If both are blank, students see “Location to be confirmed”.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notice">Event notes (optional)</Label>
        <textarea
          id="notice"
          name="notice"
          defaultValue={defaults.notice}
          rows={4}
          maxLength={2000}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
        />
        <p className="text-muted-foreground text-xs">
          Shown on the event page. Up to 2000 characters.
        </p>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : mode === "create" ? "Create event" : "Save changes"}
      </Button>
    </form>
  );
}
