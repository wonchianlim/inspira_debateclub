import "server-only";

import type { EventStatus } from "@/lib/domain/event-lifecycle";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 活动的读取（俱乐部管理用）。
 *
 * 用**用户身份**客户端：能读能写由 RLS 决定（`events_manage` 要求管理员角色）。
 */

export type EventSummary = {
  id: string;
  title: string;
  status: EventStatus;
  eventDate: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  enabledFormatCount: number;
};

export type EventDetail = EventSummary & {
  /** 比赛设置（Phase 6）：第一场开始时间；为空表示沿用活动开始时间 */
  matchStartAt: string | null;
  matchIntervalMinutes: number;
  roomNames: string[];
  checkInOpensAt: string;
  warningAt: string;
  meetingUrl: string | null;
  venue: string | null;
  notice: string | null;
  createdBy: string;
  createdAt: string;
  formats: EventFormatEntry[];
};

export type EventFormatEntry = {
  formatId: string;
  code: string;
  name: string;
  /** 该赛制是否在本活动中启用 */
  enabled: boolean;
  motion: string | null;
};

type EventRow = {
  id: string;
  title: string;
  status: string;
  event_date: string;
  match_start_at: string | null;
  match_interval_minutes: number | null;
  room_names: string[] | null;
  timezone: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  check_in_opens_at: string;
  warning_at: string;
  meeting_url: string | null;
  venue: string | null;
  notice: string | null;
  created_by: string;
  created_at: string;
  event_formats:
    | {
        format_id: string;
        enabled: boolean;
        debate_formats: { code: string; name: string } | null;
      }[]
    | null;
};

const EVENT_COLUMNS =
  "id, title, status, event_date, timezone, starts_at, ends_at, registration_opens_at, " +
  "match_start_at, match_interval_minutes, room_names, " +
  "registration_closes_at, check_in_opens_at, warning_at, meeting_url, venue, notice, created_by, created_at, " +
  "event_formats(format_id, enabled, debate_formats(code, name))";

function toDetail(row: EventRow): EventDetail {
  const formats: EventFormatEntry[] = (row.event_formats ?? [])
    .map((entry) => ({
      formatId: entry.format_id,
      code: entry.debate_formats?.code ?? "?",
      name: entry.debate_formats?.name ?? "（未知赛制）",
      enabled: entry.enabled,
      motion: null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    id: row.id,
    title: row.title,
    status: row.status as EventStatus,
    eventDate: row.event_date,
    timezone: row.timezone,
    matchStartAt: row.match_start_at as string | null,
    matchIntervalMinutes: (row.match_interval_minutes as number | null) ?? 60,
    roomNames: (row.room_names as string[] | null) ?? [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    checkInOpensAt: row.check_in_opens_at,
    warningAt: row.warning_at,
    meetingUrl: row.meeting_url,
    venue: row.venue,
    notice: row.notice,
    createdBy: row.created_by,
    createdAt: row.created_at,
    formats,
    enabledFormatCount: formats.filter((format) => format.enabled).length,
  };
}

const LIST_LIMIT = 200;

export async function listEvents(filters: { status?: EventStatus } = {}): Promise<EventSummary[]> {
  const supabase = await createUserSupabaseClient();

  let query = supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .order("starts_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin] 读取活动列表失败:", error.message);
    return [];
  }

  return (data as unknown as EventRow[]).map((row) => {
    const detail = toDetail(row);
    return {
      id: detail.id,
      title: detail.title,
      status: detail.status,
      eventDate: detail.eventDate,
      timezone: detail.timezone,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
      registrationOpensAt: detail.registrationOpensAt,
      registrationClosesAt: detail.registrationClosesAt,
      enabledFormatCount: detail.enabledFormatCount,
    };
  });
}

export async function getEventDetail(eventId: string): Promise<EventDetail | null> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[admin] 读取活动详情失败:", error.message);
    return null;
  }
  if (!data) return null;

  return toDetail(data as unknown as EventRow);
}
