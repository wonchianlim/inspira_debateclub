import "server-only";

import { createUserSupabaseClient } from "@/lib/supabase/server";
import type { PairingWarning } from "@/lib/domain/pairing-warnings";

/**
 * 管理员查看配对提案（Phase 4 / P4-6）。
 */

export type PairingTeamView = {
  teamId: string;
  formatId: string;
  formatCode: string;
  teamLabel: string | null;
  status: "proposed" | "confirmed" | "dissolved";
  locked: boolean;
  manuallyEdited: boolean;
  averageRating: number | null;
  members: { studentId: string; displayName: string; school: string | null; rating: number }[];
};

export type PairingOverview = {
  proposalId: string;
  algorithmVersion: string;
  status: "draft" | "confirmed" | "superseded";
  generatedAt: string;
  warnings: PairingWarning[];
  summary: {
    teamCount?: number;
    totalCost?: number;
    unallocatedCount?: number;
    preservedTeamCount?: number;
  };
  teams: PairingTeamView[];
  /** 已报名但**没有**被分配进任何队伍的学生，管理员需要处理 */
  unallocatedNames: { studentId: string; displayName: string }[];
};

type ProposalRow = {
  id: string;
  algorithm_version: string;
  status: string;
  generated_at: string;
  warnings: unknown;
  summary: unknown;
};

type TeamRow = {
  id: string;
  format_id: string;
  team_label: string | null;
  status: string;
  locked: boolean;
  manually_edited: boolean;
  average_rating: number | null;
  debate_formats: { code: string } | null;
  team_members:
    | {
        speaker_position: number | null;
        participations: {
          student_id: string;
          rating_snapshot: number;
          student_profiles: {
            school: string | null;
            profiles: { display_name: string } | null;
          } | null;
        } | null;
      }[]
    | null;
};

/** 最新的提案概览。没有生成过时返回 null。 */
export async function getPairingOverview(eventId: string): Promise<PairingOverview | null> {
  const supabase = await createUserSupabaseClient();

  const { data: proposalData, error: proposalError } = await supabase
    .from("pairing_proposals")
    .select("id, algorithm_version, status, generated_at, warnings, summary")
    .eq("event_id", eventId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (proposalError) {
    console.error("[admin] 读取配对提案失败:", proposalError.message);
    return null;
  }
  if (!proposalData) return null;

  const proposal = proposalData as unknown as ProposalRow;

  const { data: teamData, error: teamError } = await supabase
    .from("teams")
    .select(
      "id, format_id, team_label, status, locked, manually_edited, average_rating, " +
        "debate_formats(code), " +
        "team_members(speaker_position, participations(student_id, rating_snapshot, " +
        "student_profiles(school, profiles(display_name))))",
    )
    .eq("event_id", eventId)
    .neq("status", "dissolved")
    .order("team_label", { ascending: true });

  if (teamError) {
    console.error("[admin] 读取队伍失败:", teamError.message);
    return null;
  }

  const teams: PairingTeamView[] = ((teamData ?? []) as unknown as TeamRow[]).map((row) => ({
    teamId: row.id,
    formatId: row.format_id,
    formatCode: row.debate_formats?.code ?? "?",
    teamLabel: row.team_label,
    status: row.status as PairingTeamView["status"],
    locked: row.locked,
    manuallyEdited: row.manually_edited,
    averageRating: row.average_rating,
    members: (row.team_members ?? [])
      .map((member) => ({
        studentId: member.participations?.student_id ?? "",
        displayName: member.participations?.student_profiles?.profiles?.display_name ?? "（未知）",
        school: member.participations?.student_profiles?.school ?? null,
        rating: member.participations?.rating_snapshot ?? 0,
        position: member.speaker_position ?? 0,
      }))
      .filter((member) => member.studentId !== "")
      .sort((a, b) => a.position - b.position),
  }));

  /*
   * 谁**没有被**分配进任何队伍。
   *
   * 只列出"已报名且仍然有效"却不在任何队伍里的学生 ——
   * 那是管理员真正需要处理的人。已取消报名的人不该出现在这里。
   */
  const allocatedStudentIds = new Set(
    teams.flatMap((team) => team.members.map((m) => m.studentId)),
  );

  const { data: registrations } = await supabase
    .from("registrations")
    .select("student_id, status, student_profiles(profiles(display_name))")
    .eq("event_id", eventId)
    .in("status", ["registered", "checked_in"]);

  type RegistrationRow = {
    student_id: string;
    student_profiles: { profiles: { display_name: string } | null } | null;
  };

  const unallocatedNames = ((registrations ?? []) as unknown as RegistrationRow[])
    .filter((row) => !allocatedStudentIds.has(row.student_id))
    .map((row) => ({
      studentId: row.student_id,
      displayName: row.student_profiles?.profiles?.display_name ?? "（未知）",
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const summary = (proposal.summary ?? {}) as PairingOverview["summary"];

  return {
    proposalId: proposal.id,
    algorithmVersion: proposal.algorithm_version,
    status: proposal.status as PairingOverview["status"],
    generatedAt: proposal.generated_at,
    warnings: Array.isArray(proposal.warnings) ? (proposal.warnings as PairingWarning[]) : [],
    summary,
    teams,
    unallocatedNames,
  };
}
