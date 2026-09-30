import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { NoticeAudience } from "@/lib/validation/notices";

/**
 * 通知的读取（俱乐部管理用）。
 *
 * 管理员能看到全部通知（含草稿与已过期）—— `notices_select_manager` 策略允许。
 * 其他角色只能看到"已发布、未过期、且与自己相关"的通知，那段逻辑在数据库策略里。
 */

export type NoticeEntry = {
  id: string;
  title: string;
  body: string;
  audienceType: NoticeAudience;
  eventId: string | null;
  /** 目标活动名称（若有），用于列表显示 */
  eventTitle: string | null;
  role: string | null;
  formatId: string | null;
  /** 目标赛制代号（若有） */
  formatCode: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  audience_type: string;
  event_id: string | null;
  role: string | null;
  format_id: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  events: { title: string } | null;
  debate_formats: { code: string } | null;
};

const NOTICE_COLUMNS =
  "id, title, body, audience_type, event_id, role, format_id, published_at, expires_at, " +
  "created_by, created_at, updated_at, events(title), debate_formats(code)";

function toEntry(row: NoticeRow): NoticeEntry {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audienceType: row.audience_type as NoticeAudience,
    eventId: row.event_id,
    eventTitle: row.events?.title ?? null,
    role: row.role,
    formatId: row.format_id,
    formatCode: row.debate_formats?.code ?? null,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 通知的显示状态。草稿/已发布/已过期是**读时判断**，不落库。 */
export type NoticeStatus = "draft" | "scheduled" | "published" | "expired";

export function noticeStatusOf(
  notice: Pick<NoticeEntry, "publishedAt" | "expiresAt">,
  now = new Date(),
): NoticeStatus {
  if (!notice.publishedAt) return "draft";
  if (new Date(notice.publishedAt).getTime() > now.getTime()) return "scheduled";
  if (notice.expiresAt && new Date(notice.expiresAt).getTime() <= now.getTime()) return "expired";
  return "published";
}

const LIST_LIMIT = 200;

export async function listNotices(): Promise<NoticeEntry[]> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("notices")
    .select(NOTICE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("[admin] 读取通知列表失败:", error.message);
    return [];
  }
  return (data as unknown as NoticeRow[]).map(toEntry);
}

export async function getNoticeDetail(noticeId: string): Promise<NoticeEntry | null> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("notices")
    .select(NOTICE_COLUMNS)
    .eq("id", noticeId)
    .maybeSingle();

  if (error) {
    console.error("[admin] 读取通知详情失败:", error.message);
    return null;
  }
  if (!data) return null;
  return toEntry(data as unknown as NoticeRow);
}

export type NotificationCenterEntry = {
  id: string;
  title: string;
  body: string;
  audienceType: NoticeAudience;
  publishedAt: string;
  /** 我什么时候读过；null 表示还没读 */
  readAt: string | null;
};

/**
 * "我能看到的通知"（通知中心用）。
 *
 * 刻意**不加**任何受众筛选条件：能读到什么完全由 RLS 策略决定
 * （`notices_select_audience`）。这是本项目的一贯做法 ——
 * 数据库负责"能不能看到"，应用只负责"怎么显示"。
 * 若在应用里再写一份受众判断，两边迟早不一致。
 */
export async function listVisibleNotices(): Promise<NotificationCenterEntry[]> {
  const supabase = await createUserSupabaseClient();
  const { data, error } = await supabase
    .from("notices")
    .select("id, title, body, audience_type, published_at, notice_reads(read_at)")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[admin] 读取可见通知失败:", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    /*
     * ⚠️ `notice_reads` 是**一对多**的形状（一个人对一条通知理论上只有一条回执，
     *    由唯一约束保证），但 PostgREST 返回的仍是数组。
     *    取第一条即可；数组为空就是"还没读"。
     */
    const reads = (row as { notice_reads?: { read_at: string }[] | null }).notice_reads ?? [];
    return {
      id: row.id as string,
      title: row.title as string,
      body: row.body as string,
      audienceType: row.audience_type as NoticeAudience,
      publishedAt: row.published_at as string,
      readAt: reads[0]?.read_at ?? null,
    };
  });
}
