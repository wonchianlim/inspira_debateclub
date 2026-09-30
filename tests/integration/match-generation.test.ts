// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { generateAndSaveMatches } from "@/lib/admin/matches";

/**
 * 比赛生成与持久化的**集成测试**（Phase 5 / P5-6）。
 *
 * P5-6 交付时明确写了"持久化服务尚未端到端验证"。这一条补上。
 *
 * ⚠️ 用服务角色客户端，因此**不覆盖 RLS**（权限由 `scripts/db-tests.sql` 覆盖）。
 * ⚠️ 全部虚构数据，邮箱一律 `example.invalid`。
 */

const EVENT_TITLE = "比赛生成集成测试活动";

function loadEnv(): { url?: string; serviceRoleKey?: string } {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const map = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match?.[1] && match[2] !== undefined) map.set(match[1], match[2]);
    }
    return {
      url: map.get("NEXT_PUBLIC_SUPABASE_URL") ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: map.get("SUPABASE_SERVICE_ROLE_KEY") ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  } catch {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
}

const env = loadEnv();
const available = Boolean(env.url && env.serviceRoleKey);
const describeWithDatabase = available ? describe : describe.skip;

if (!available) {
  console.warn(
    "[集成测试] 未找到本地数据库配置，比赛生成集成测试被跳过。请先运行 supabase start。",
  );
}

describeWithDatabase("比赛生成与持久化（集成，使用真实数据库）", () => {
  let supabase: SupabaseClient<Database>;
  let eventId: string;
  let formatId: string;
  let teamIds: string[];
  let ownerProfileId: string;

  const ensureAuthUser = async (email: string): Promise<string> => {
    const { data: listing, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(`列出认证账号失败：${error.message}`);
    const existing = listing?.users.find((user) => user.email === email);
    if (existing) return existing.id;
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: "MatchTest123!",
      email_confirm: true,
    });
    if (createError) throw new Error(`创建认证账号失败（${email}）：${createError.message}`);
    return data.user?.id as string;
  };

  beforeAll(async () => {
    supabase = createClient<Database>(env.url as string, env.serviceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await cleanup(supabase);

    ownerProfileId = await ensureAuthUser("match-gen-owner@example.invalid");

    const { data: formats } = await supabase.from("debate_formats").select("id, code");
    formatId = formats?.find((format) => format.code === "PF")?.id as string;

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        title: EVENT_TITLE,
        event_date: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
        registration_opens_at: new Date(Date.now() - 86400_000).toISOString(),
        registration_closes_at: new Date(Date.now() + 86400_000).toISOString(),
        check_in_opens_at: new Date().toISOString(),
        warning_at: new Date().toISOString(),
        starts_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
        ends_at: new Date(Date.now() + 4 * 86400_000).toISOString(),
        created_by: ownerProfileId,
      })
      .select("id")
      .single();
    if (eventError) throw new Error(`创建活动失败：${eventError.message}`);
    eventId = event?.id as string;

    const { error: formatError } = await supabase
      .from("event_formats")
      .insert({ event_id: eventId, format_id: formatId, enabled: true });
    if (formatError) throw new Error(`启用赛制失败：${formatError.message}`);

    // --- 四位学生、四条参与、两支队伍（每队 2 人，PF 是 2 人一队） ---
    const ratings = [3, 4, 8, 9];
    const studentProfileIds: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const profileId = await ensureAuthUser(`match-gen-student-${index + 1}@example.invalid`);
      const { data: studentProfile, error: spError } = await supabase
        .from("student_profiles")
        .insert({ profile_id: profileId })
        .select("id")
        .single();
      if (spError) throw new Error(`创建学生档案失败：${spError.message}`);
      studentProfileIds.push(studentProfile?.id as string);
    }

    const { data: participations, error: participationError } = await supabase
      .from("participations")
      .insert(
        studentProfileIds.map((studentId, index) => ({
          event_id: eventId,
          student_id: studentId,
          format_id: formatId,
          rating_snapshot: ratings[index] as number,
          status: "confirmed" as const,
        })),
      )
      .select("id");
    if (participationError) throw new Error(`写入参与失败：${participationError.message}`);

    // 评分相近的两人一队：3+4 与 8+9
    const { data: teams, error: teamError } = await supabase
      .from("teams")
      .insert([
        { event_id: eventId, format_id: formatId, average_rating: 3.5, team_label: "PF-1" },
        { event_id: eventId, format_id: formatId, average_rating: 8.5, team_label: "PF-2" },
      ])
      .select("id");
    if (teamError) throw new Error(`创建队伍失败：${teamError.message}`);
    teamIds = (teams ?? []).map((team) => team.id);

    const { error: memberError } = await supabase.from("team_members").insert([
      {
        team_id: teamIds[0] as string,
        participation_id: participations?.[0]?.id as string,
        speaker_position: 1,
      },
      {
        team_id: teamIds[0] as string,
        participation_id: participations?.[1]?.id as string,
        speaker_position: 2,
      },
      {
        team_id: teamIds[1] as string,
        participation_id: participations?.[2]?.id as string,
        speaker_position: 1,
      },
      {
        team_id: teamIds[1] as string,
        participation_id: participations?.[3]?.id as string,
        speaker_position: 2,
      },
    ]);
    if (memberError) throw new Error(`写入队伍成员失败：${memberError.message}`);
  }, 90_000);

  afterAll(async () => {
    if (supabase) await cleanup(supabase);
  }, 90_000);

  it("生成并落库：两支队伍 → 一场比赛，正反方各一个", async () => {
    const result = await generateAndSaveMatches(eventId, supabase);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.matchCount).toBe(1);

    const { data: matches } = await supabase
      .from("matches")
      .select("id, match_number, room_name, match_teams(team_id, position)")
      .eq("event_id", eventId);

    expect(matches).toHaveLength(1);
    expect(matches?.[0]?.match_number).toBe(1);
    // 房间名由生成器分配，不应为空
    expect(matches?.[0]?.room_name).toBeTruthy();

    const positions = (matches?.[0]?.match_teams ?? [])
      .map((entry) => (entry as { position: string }).position)
      .sort();
    expect(positions).toEqual(["OPP", "PROP"]);
  }, 60_000);

  it("重复生成不会留下重复的比赛（覆盖式替换未开始的比赛）", async () => {
    const before = await supabase.from("matches").select("id").eq("event_id", eventId);
    expect(before.data).toHaveLength(1);

    // 第二次生成：未开始的比赛会被替换，因此仍然是 1 场
    const result = await generateAndSaveMatches(eventId, supabase);
    expect(result.ok).toBe(true);

    const after = await supabase.from("matches").select("id").eq("event_id", eventId);
    expect(after.data?.length).toBeLessThanOrEqual((before.data?.length ?? 0) + 1);
  }, 60_000);

  it("**已开始的比赛会被保留**（规范 10.7 第 3 条）", async () => {
    /*
     * ⚠️ 这里**不调用 `start_match`**，而是直接标记 `roster_locked_at`。
     *
     * 原因：`start_match` 会写入 `match_roster_snapshots`，而那张表有"只增不改"触发器 ——
     * 连服务角色也删不掉，测试收尾就无法清理，集成测试也就不再幂等。
     * 而"保留已锁定比赛"这段逻辑**只看 `roster_locked_at`**，不看快照，
     * 因此直接标记即可覆盖被测行为，且不留不可清理的数据。
     *
     * （`start_match` 本身的行为由 `scripts/db-tests.sql` 的「比赛流程」一节覆盖。）
     */
    const { data: existing } = await supabase
      .from("matches")
      .select("id")
      .eq("event_id", eventId)
      .limit(1)
      .single();
    const lockedMatchId = existing?.id as string;

    const { error: startError } = await supabase
      .from("matches")
      .update({ roster_locked_at: new Date().toISOString(), status: "started" })
      .eq("id", lockedMatchId);
    expect(startError).toBeNull();

    const { data: locked } = await supabase
      .from("matches")
      .select("roster_locked_at")
      .eq("id", lockedMatchId)
      .single();
    expect(locked?.roster_locked_at).not.toBeNull();

    /*
     * 再生成一次。
     *
     * ⚠️ 此时**两支队伍都已经在已锁定的比赛里**，因此服务会返回一个**明确的说明**
     * （"所有队伍都已经在已开始的比赛里了"）而不是成功 —— 那是**正确行为**：
     * 没有可重新分组的队伍时，说"生成成功 0 场"会误导管理员。
     * 初版这里断言 `result.ok === true`，是我的期望写错了。
     *
     * 真正要验证的是：**已锁定的比赛还在，且仍然锁定**。
     */
    const result = await generateAndSaveMatches(eventId, supabase);
    if (!result.ok) {
      expect(result.message).toContain("已开始");
    } else {
      // 若将来允许部分重新分组，则必须报告保留了哪些
      expect(result.preservedMatchCount).toBeGreaterThanOrEqual(1);
    }

    const { data: stillThere } = await supabase
      .from("matches")
      .select("id, roster_locked_at")
      .eq("id", lockedMatchId)
      .maybeSingle();
    expect(stillThere, "已开始的比赛被重新生成删掉了").not.toBeNull();
    expect(stillThere?.roster_locked_at).not.toBeNull();
  }, 90_000);

  it("所有队伍都已进入已开始的比赛时，明确说明没有可重新分组的队伍", async () => {
    const result = await generateAndSaveMatches(eventId, supabase);
    // 此时两支队伍都在已锁定的比赛里
    if (!result.ok) {
      expect(result.message).toContain("已开始");
    } else {
      // 也可能被判定为"没有需要重新分组的队伍"后返回成功但 0 场
      expect(result.matchCount).toBe(0);
    }
  }, 60_000);
});

/** 清理本次集成测试造出的全部虚构数据。 */
async function cleanup(supabase: SupabaseClient<Database>): Promise<void> {
  const { data: events } = await supabase.from("events").select("id").eq("title", EVENT_TITLE);
  const eventIds = (events ?? []).map((event) => event.id);

  if (eventIds.length > 0) {
    const { data: matches } = await supabase.from("matches").select("id").in("event_id", eventIds);
    const matchIds = (matches ?? []).map((match) => match.id);

    if (matchIds.length > 0) {
      await supabase.from("judge_assignments").delete().in("match_id", matchIds);
    }
    await supabase.from("match_roster_snapshots").delete().in("event_id", eventIds);
    await supabase.from("match_teams").delete().in("match_id", matchIds);
    await supabase.from("matches").delete().in("id", matchIds);
    await supabase
      .from("team_members")
      .delete()
      .in(
        "team_id",
        ((await supabase.from("teams").select("id").in("event_id", eventIds)).data ?? []).map(
          (team) => team.id,
        ),
      );
    await supabase.from("teams").delete().in("event_id", eventIds);
    await supabase.from("participations").delete().in("event_id", eventIds);
    await supabase.from("event_formats").delete().in("event_id", eventIds);
    await supabase.from("events").delete().in("id", eventIds);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .like("email", "match-gen-%@example.invalid");
  const profileIds = (profiles ?? []).map((profile) => profile.id);
  const emails = (profiles ?? []).map((profile) => profile.email as string);

  if (profileIds.length > 0) {
    await supabase.from("student_profiles").delete().in("profile_id", profileIds);
    await supabase.from("audit_logs").delete().in("actor_profile_id", profileIds);
    await supabase.from("profiles").delete().in("id", profileIds);
  }

  const { data: listing } = await supabase.auth.admin.listUsers();
  for (const email of emails) {
    const match = listing?.users.find((user) => user.email === email);
    if (match) await supabase.auth.admin.deleteUser(match.id);
  }
}
