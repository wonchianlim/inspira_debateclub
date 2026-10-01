import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { EventStatus } from "@/lib/domain/event-lifecycle";
import type { RegistrationStatus } from "@/lib/validation/registrations";

/**
 * 学生视角的报名数据读取。
 *
 * 用**用户身份**客户端：能读到哪些活动、哪些报名由 RLS 决定
 * （`events_select_authenticated`、`registrations_select_own_or_staff`）。
 */

export type StudentEventCard = {
  id: string;
  title: string;
  status: EventStatus;
  timezone: string;
  eventDate: string;
  startsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  /**
   * 签到开放时刻。
   *
   * 学生首页要用它决定"去签到"这个主按钮是否成立 ——
   * 不能用 `CHECK_IN_OPENS_MINUTES_BEFORE` 那个常量代替：
   * 它只是**写入时**的默认值，管理员改过设置之后两者就不再相等。
   * 数据库里的这一列才是权威值。
   */
  checkInOpensAt: string;
  /**
   * 线下场地。线上活动为空 —— 与 `meetingUrl` 二选一，也可能两者都还没定。
   * 界面显示规则：有链接算"线上"，否则显示场地，两者都没有就显示"地点待定"。
   */
  venue: string | null;
  /**
   * 线上会议链接。
   * ⚠️ 列表也要用它：判断"这是线上活动还是线下活动"需要同时看 venue 与 meetingUrl
   * （`describeEventLocation`），只看 venue 会把线上活动显示成"地点待定"。
   */
  meetingUrl: string | null;
  notice: string | null;
  /** 我在这张活动上的报名状态；null 表示还没报名 */
  myRegistrationStatus: RegistrationStatus | null;
  myRegistrationId: string | null;
  enabledFormatCount: number;
};

export type StudentFormatChoice = {
  formatId: string;
  code: string;
  name: string;
  /** 活动是否启用 */
  eventFormatEnabled: boolean;
  /** 我是否合格 */
  studentEligible: boolean;
  /** 我的偏好名次；未选择则为 null */
  myPreferenceRank: number | null;
};

export type StudentEventDetail = StudentEventCard & {
  endsAt: string;
  meetingUrl: string | null;
  formats: StudentFormatChoice[];
};

type EventRow = {
  id: string;
  title: string;
  status: string;
  timezone: string;
  event_date: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  check_in_opens_at: string;
  meeting_url: string | null;
  venue: string | null;
  notice: string | null;
  event_formats:
    | {
        format_id: string;
        enabled: boolean;
        debate_formats: { code: string; name: string } | null;
      }[]
    | null;
};

const EVENT_COLUMNS =
  "id, title, status, timezone, event_date, starts_at, ends_at, registration_opens_at, " +
  "registration_closes_at, check_in_opens_at, meeting_url, venue, notice, " +
  "event_formats(format_id, enabled, debate_formats(code, name))";

/** 我自己的报名（id → 状态），以及我自己的赛制资格与偏好。 */
async function loadMyRegistrationData() {
  const supabase = await createUserSupabaseClient();

  /*
   * 学生档案 id：用数据库提供的安全函数取得，而不是自己去查
   * `student_profiles` —— 因为 RLS 会**正确地**隐藏别人的行，
   * 自己查很容易取到 NULL（P3-1 就踩过这个坑）。
   */
  const { data: myStudentId } = await supabase.rpc("my_student_id");

  if (!myStudentId) {
    return { registrations: [], eligibleFormatIds: new Set<string>() };
  }

  const [{ data: registrations }, { data: formatProfiles }] = await Promise.all([
    supabase.from("registrations").select("id, event_id, status"),
    supabase
      .from("student_format_profiles")
      .select("format_id, eligible")
      .eq("student_id", myStudentId),
  ]);

  const eligibleFormatIds = new Set(
    (formatProfiles ?? []).filter((row) => row.eligible).map((row) => row.format_id as string),
  );

  return { registrations: registrations ?? [], eligibleFormatIds };
}

export async function listStudentEvents(): Promise<StudentEventCard[]> {
  const supabase = await createUserSupabaseClient();
  const [{ data, error }, mine] = await Promise.all([
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .order("starts_at", { ascending: false })
      .limit(100),
    loadMyRegistrationData(),
  ]);

  if (error) {
    console.error("[student] 读取活动列表失败:", error.message);
    return [];
  }

  const registrationByEvent = new Map(
    mine.registrations.map((row) => [row.event_id as string, row] as const),
  );

  return (data as unknown as EventRow[]).map((row) => {
    const registration = registrationByEvent.get(row.id);
    return {
      id: row.id,
      title: row.title,
      status: row.status as EventStatus,
      timezone: row.timezone,
      eventDate: row.event_date,
      startsAt: row.starts_at,
      registrationOpensAt: row.registration_opens_at,
      registrationClosesAt: row.registration_closes_at,
      checkInOpensAt: row.check_in_opens_at,
      venue: row.venue,
      meetingUrl: row.meeting_url,
      notice: row.notice,
      myRegistrationId: (registration?.id as string | undefined) ?? null,
      myRegistrationStatus: (registration?.status as RegistrationStatus | undefined) ?? null,
      enabledFormatCount: (row.event_formats ?? []).filter((f) => f.enabled).length,
    };
  });
}

export async function getStudentEventDetail(eventId: string): Promise<StudentEventDetail | null> {
  const supabase = await createUserSupabaseClient();

  const [{ data, error }, mine] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle(),
    loadMyRegistrationData(),
  ]);

  if (error) {
    console.error("[student] 读取活动详情失败:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as EventRow;
  const registration = mine.registrations.find((entry) => entry.event_id === eventId);

  // 我的偏好名次
  const preferenceByFormat = new Map<string, number>();
  if (registration) {
    const { data: preferences } = await supabase
      .from("registration_format_preferences")
      .select("format_id, preference_rank")
      .eq("registration_id", registration.id);
    for (const entry of preferences ?? []) {
      preferenceByFormat.set(entry.format_id as string, entry.preference_rank as number);
    }
  }

  const formats: StudentFormatChoice[] = (row.event_formats ?? [])
    .map((entry) => ({
      formatId: entry.format_id,
      code: entry.debate_formats?.code ?? "?",
      name: entry.debate_formats?.name ?? "（未知赛制）",
      eventFormatEnabled: entry.enabled,
      studentEligible: mine.eligibleFormatIds.has(entry.format_id),
      myPreferenceRank: preferenceByFormat.get(entry.format_id) ?? null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    id: row.id,
    title: row.title,
    status: row.status as EventStatus,
    timezone: row.timezone,
    eventDate: row.event_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    checkInOpensAt: row.check_in_opens_at,
    meetingUrl: row.meeting_url,
    venue: row.venue,
    notice: row.notice,
    formats,
    myRegistrationId: (registration?.id as string | undefined) ?? null,
    myRegistrationStatus: (registration?.status as RegistrationStatus | undefined) ?? null,
    enabledFormatCount: formats.filter((format) => format.eventFormatEnabled).length,
  };
}
