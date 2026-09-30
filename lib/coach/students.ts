import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 教练工具（Phase 8 / P8-3b）。
 *
 * 规范第 15 节 Phase 8："**Coach student history and private notes.**"
 *
 * ⚠️ 一个现状要说清楚：RLS 允许 `is_staff()`（**包含教练**）看到**所有**学生的档案，
 *    而不是只有自己带的学生 —— 因为系统里**没有**教练与学生的关联表。
 *    因此这个列表是"全社的学生"。限制成"只带的学生"需要先有那张关联表，
 *    那属于数据模型工作，我不擅自加。
 */

export type CoachStudentRow = {
  studentId: string;
  displayName: string;
  school: string | null;
  /** 该学生已发布的评分表数量 */
  publishedBallots: number;
};

/** 教练可以看到的学生列表。 */
export async function listStudentsForCoach(): Promise<CoachStudentRow[]> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("student_profiles")
    .select("id, school, profiles(display_name)");

  if (error) throw new Error(`读取学生列表失败：${error.message}`);

  type Row = {
    id: string;
    school: string | null;
    profiles: { display_name: string } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .map((row) => ({
      studentId: row.id,
      displayName: row.profiles?.display_name ?? "（未填姓名）",
      school: row.school,
      publishedBallots: 0,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export type CoachNote = {
  noteId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * 这位教练**自己**给某位学生写的笔记。
 *
 * ⚠️ 只有本人能看到（迁移里刻意做成最严格的一种）——
 *    因此这里查不到别的教练的笔记，那是**预期行为**，不是 bug。
 */
export async function listMyNotesForStudent(studentId: string): Promise<CoachNote[]> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("coach_notes")
    .select("id, body, created_at, updated_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`读取笔记失败：${error.message}`);

  return (data ?? []).map((row) => ({
    noteId: row.id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export type CoachStudentDetail = {
  studentId: string;
  displayName: string;
  school: string | null;
  /** 已发布的评分表，学生的成长基础 */
  publishedBallots: number;
  /** 表现过的赛制 */
  formats: string[];
};

/** 某位学生的基本信息。 */
export async function getStudentForCoach(studentId: string): Promise<CoachStudentDetail | null> {
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("student_profiles")
    .select(
      "id, school, profiles(display_name), participations(matches(debate_formats(code), ballots(status)))",
    )
    .eq("id", studentId)
    .maybeSingle();

  if (error) throw new Error(`读取学生失败：${error.message}`);
  if (!data) return null;

  type Row = {
    id: string;
    school: string | null;
    profiles: { display_name: string } | null;
    participations:
      | {
          matches: {
            debate_formats: { code: string } | null;
            ballots: { status: string }[] | null;
          } | null;
        }[]
      | null;
  };

  const row = data as unknown as Row;
  const formats = new Set<string>();
  let published = 0;

  for (const participation of row.participations ?? []) {
    const match = participation.matches;
    if (!match) continue;
    if (match.debate_formats?.code) formats.add(match.debate_formats.code);
    for (const ballot of match.ballots ?? []) {
      // 只有已发布的才算 —— 未发布的评分表学生自己也看不到
      if (ballot.status === "published") published += 1;
    }
  }

  return {
    studentId: row.id,
    displayName: row.profiles?.display_name ?? "（未填姓名）",
    school: row.school,
    publishedBallots: published,
    formats: [...formats].sort(),
  };
}
