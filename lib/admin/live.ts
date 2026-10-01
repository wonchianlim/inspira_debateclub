import "server-only";

import { isCheckInOpen } from "@/lib/domain/registration";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import {
  type LiveCounts,
  type LiveState,
  type LiveStatusResult,
  computeLiveStatus,
  summarizeLiveCounts,
} from "@/lib/domain/live-status";

/**
 * 现场看板与签到的读取层（Phase 6 / 规范第 2.8 节）。
 */

export type LiveMatchView = {
  matchId: string;
  matchNumber: number;
  roomName: string;
  formatCode: string;
  scheduledStart: string;
  status: string;
  ironman: boolean;
  requiredParticipants: number;
  presentParticipants: number;
  requiredJudges: number;
  presentJudges: number;
  live: LiveStatusResult;
  /**
   * 未签到的学生（含 id）。
   *
   * ⚠️ 必须带 id：管理员在界面上要能**直接代签到**，
   * 而只给姓名的话按钮没有可提交的标识。
   */
  missingStudents: { studentId: string; displayName: string }[];
};

export type LiveDashboard = {
  eventStartsAt: string;
  warningAt: string;
  /** 签到是否已开放（开始前 30 分钟） */
  checkInOpen: boolean;
  matches: LiveMatchView[];
  counts: LiveCounts;
  /** 活动层面的签到统计 */
  registrationCounts: { total: number; checkedIn: number };
};

type MatchRow = {
  id: string;
  match_number: number;
  room_name: string;
  scheduled_start: string;
  status: string;
  ironman: boolean;
  debate_formats: { code: string } | null;
  match_teams:
    | {
        teams: {
          team_members:
            | {
                is_ironman: boolean;
                participations: {
                  student_id: string;
                  student_profiles: { profiles: { display_name: string } | null } | null;
                } | null;
              }[]
            | null;
        } | null;
      }[]
    | null;
  judge_assignments:
    | {
        judge_id: string;
        status: string;
        judge_profiles: { checked_in_at: string | null } | null;
      }[]
    | null;
};

/** 读取某活动的现场看板。 */
export async function getLiveDashboard(eventId: string): Promise<LiveDashboard | null> {
  const supabase = await createUserSupabaseClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, starts_at, warning_at, check_in_opens_at")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new Error(`读取活动失败：${eventError.message}`);
  if (!event) return null;

  const [{ data: matchData, error: matchError }, { data: registrations }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, match_number, room_name, scheduled_start, status, ironman, debate_formats(code), " +
          "match_teams(teams(team_members(is_ironman, participations(student_id, " +
          "student_profiles(profiles(display_name)))))), " +
          "judge_assignments(judge_id, status, judge_profiles(checked_in_at))",
      )
      .eq("event_id", eventId)
      .order("scheduled_start", { ascending: true })
      .order("match_number", { ascending: true }),
    supabase
      .from("registrations")
      .select("student_id, checked_in_at")
      .eq("event_id", eventId)
      .in("status", ["registered", "checked_in"]),
  ]);

  if (matchError) throw new Error(`读取比赛失败：${matchError.message}`);

  /*
   * 已签到的学生集合。
   *
   * `registrations.checked_in_at` 是**活动层面**的签到；
   * 而现场状态是**每场比赛**的 —— 一场比赛需要的学生是这支队里的人。
   * 因此这里按"这位学生在本活动是否签到"来判断他是否到场。
   */
  const checkedInStudentIds = new Set(
    (registrations ?? [])
      .filter((row) => row.checked_in_at !== null)
      .map((row) => row.student_id as string),
  );

  const now = new Date();
  const warningAt = new Date(event.warning_at);
  /*
   * ⚠️ 签到是否开放读的是**这次活动自己的** `check_in_opens_at`，
   * 不是"开始前 30 分钟"那个默认值 —— 管理员可以在系统设置里改掉它，
   * 于是两者会不相等，看板与数据库会各说各话。
   * （原来这里用的 `isCheckInOpen()` 就是错的，已删除，见 lib/domain/live-status.ts。）
   */
  const checkInOpensAt = new Date(event.check_in_opens_at);

  const matches: LiveMatchView[] = ((matchData ?? []) as unknown as MatchRow[]).map((row) => {
    const students = (row.match_teams ?? []).flatMap((matchTeam) =>
      (matchTeam.teams?.team_members ?? [])
        .map((member) => ({
          studentId: member.participations?.student_id ?? "",
          displayName:
            member.participations?.student_profiles?.profiles?.display_name ?? "（未知）",
        }))
        .filter((student) => student.studentId !== ""),
    );

    const presentParticipants = students.filter((student) =>
      checkedInStudentIds.has(student.studentId),
    ).length;
    const missingStudents = students
      .filter((student) => !checkedInStudentIds.has(student.studentId))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    // 已取消的指派不占用裁判
    const activeJudges = (row.judge_assignments ?? []).filter(
      (assignment) => assignment.status !== "cancelled",
    );
    const presentJudges = activeJudges.filter(
      (assignment) => assignment.judge_profiles?.checked_in_at != null,
    ).length;

    const live = computeLiveStatus({
      matchStatus: row.status,
      scheduledStart: new Date(row.scheduled_start),
      warningAt,
      now,
      requiredParticipantCount: students.length,
      presentParticipantCount: presentParticipants,
      requiredJudgeCount: activeJudges.length,
      presentJudgeCount: presentJudges,
      ballotSubmitted: row.status === "ballot_submitted",
      published: row.status === "published",
    });

    return {
      matchId: row.id,
      matchNumber: row.match_number,
      roomName: row.room_name,
      formatCode: row.debate_formats?.code ?? "?",
      scheduledStart: row.scheduled_start,
      status: row.status,
      ironman: row.ironman,
      requiredParticipants: students.length,
      presentParticipants,
      requiredJudges: activeJudges.length,
      presentJudges,
      live,
      missingStudents,
    };
  });

  return {
    eventStartsAt: event.starts_at as string,
    warningAt: event.warning_at as string,
    checkInOpen: isCheckInOpen(checkInOpensAt, now),
    matches,
    counts: summarizeLiveCounts(matches.map((match) => match.live)),
    registrationCounts: {
      total: (registrations ?? []).length,
      checkedIn: checkedInStudentIds.size,
    },
  };
}

/** 状态的中文名称（与领域层的六个语义状态一一对应）。 */
export const LIVE_STATE_TEXT: Record<LiveState, string> = {
  neutral: "未到警告时间",
  warning: "有缺人",
  ready: "已就绪",
  live: "进行中",
  complete: "已完成",
  cancelled: "已取消",
};
