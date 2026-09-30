// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { recommendJudgesForMatch } from "@/lib/admin/judge-assignment";

/**
 * 裁判推荐与指派的**集成测试**（Phase 5 / P5-4）。
 *
 * 为什么需要：`lib/admin/judge-assignment.ts` 是 server-only 的，
 * 正常路径依赖 Next 的请求上下文，无法用单元测试覆盖。
 * P5-4 交付时明确写了"尚未端到端验证" —— 这一条补上。
 *
 * ⚠️ 用服务角色客户端，因此**不覆盖 RLS**（权限由 `scripts/db-tests.sql` 覆盖）。
 * ⚠️ 全部虚构数据，邮箱一律 `example.invalid`。
 */

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

const EVENT_TITLE = "裁判推荐集成测试活动";

const env = loadEnv();
const available = Boolean(env.url && env.serviceRoleKey);
const describeWithDatabase = available ? describe : describe.skip;

if (!available) {
  console.warn(
    "[集成测试] 未找到本地数据库配置，裁判推荐集成测试被跳过。请先运行 supabase start。",
  );
}

describeWithDatabase("裁判推荐与指派（集成，使用真实数据库）", () => {
  let supabase: SupabaseClient<Database>;
  let eventId: string;
  let matchId: string;
  let formatId: string;
  let approvedJudgeId: string;
  let pendingJudgeId: string;
  let unqualifiedJudgeId: string;

  const ensureAuthUser = async (email: string): Promise<string> => {
    const { data: listing, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(`列出认证账号失败：${error.message}`);
    const existing = listing?.users.find((user) => user.email === email);
    if (existing) return existing.id;
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: "JudgeTest123!",
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

    // --- 管理员（比赛创建需要） ---
    const ownerProfileId = await ensureAuthUser("judge-rec-owner@example.invalid");

    const { data: formats } = await supabase.from("debate_formats").select("id, code");
    formatId = formats?.find((format) => format.code === "PF")?.id as string;

    // --- 活动 + 启用赛制 ---
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

    const { error: eventFormatError } = await supabase
      .from("event_formats")
      .insert({ event_id: eventId, format_id: formatId, enabled: true });
    if (eventFormatError) throw new Error(`启用赛制失败：${eventFormatError.message}`);

    // --- 比赛（暂时不挂队伍：用于验证"没有队伍时明确说明无法统计"） ---
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert({
        event_id: eventId,
        format_id: formatId,
        match_number: 1,
        room_name: "J101",
        scheduled_start: new Date(Date.now() + 3 * 86400_000).toISOString(),
      })
      .select("id")
      .single();
    if (matchError) throw new Error(`创建比赛失败：${matchError.message}`);
    matchId = match?.id as string;

    // --- 三位裁判：已批准 / 待审批 / 已批准但**没有该赛制资格** ---
    const approvedProfile = await ensureAuthUser("judge-approved@example.invalid");
    const pendingProfile = await ensureAuthUser("judge-pending@example.invalid");
    const unqualifiedProfile = await ensureAuthUser("judge-unqualified@example.invalid");

    const { data: judgeProfiles, error: judgeError } = await supabase
      .from("judge_profiles")
      .insert([
        { profile_id: approvedProfile, approval_status: "approved" },
        { profile_id: pendingProfile, approval_status: "pending" },
        { profile_id: unqualifiedProfile, approval_status: "approved" },
      ])
      .select("id, profile_id");
    if (judgeError) throw new Error(`创建裁判档案失败：${judgeError.message}`);

    const byProfile = new Map(
      (judgeProfiles ?? []).map((row) => [row.profile_id as string, row.id as string] as const),
    );
    approvedJudgeId = byProfile.get(approvedProfile) as string;
    pendingJudgeId = byProfile.get(pendingProfile) as string;
    unqualifiedJudgeId = byProfile.get(unqualifiedProfile) as string;

    // 只有前两位有 PF 资格
    const { error: qualificationError } = await supabase
      .from("judge_format_qualifications")
      .insert([
        { judge_id: approvedJudgeId, format_id: formatId, approved_by: ownerProfileId },
        { judge_id: pendingJudgeId, format_id: formatId, approved_by: ownerProfileId },
      ]);
    if (qualificationError) throw new Error(`写入裁判资格失败：${qualificationError.message}`);

    // 三人都登记"该活动可用并已批准"
    const { error: availabilityError } = await supabase.from("judge_event_availability").insert([
      {
        event_id: eventId,
        judge_id: approvedJudgeId,
        status: "approved",
        approved_at: new Date().toISOString(),
      },
      {
        event_id: eventId,
        judge_id: pendingJudgeId,
        status: "approved",
        approved_at: new Date().toISOString(),
      },
      {
        event_id: eventId,
        judge_id: unqualifiedJudgeId,
        status: "approved",
        approved_at: new Date().toISOString(),
      },
    ]);
    if (availabilityError) throw new Error(`写入裁判可用性失败：${availabilityError.message}`);
  }, 90_000);

  afterAll(async () => {
    if (supabase) await cleanup(supabase);
  }, 90_000);

  it("推荐结果按成本排序，且排除了未审批与无资格的人", async () => {
    const result = await recommendJudgesForMatch(matchId, { injectedClient: supabase });
    expect(result).not.toBeNull();

    const byId = new Map(result?.candidates.map((c) => [c.judgeId, c] as const));

    // 待审批的人不合格，原因是"尚未通过审批"
    expect(byId.get(pendingJudgeId)?.eligible).toBe(false);
    expect(byId.get(pendingJudgeId)?.ineligibilityReasons.join("")).toContain("审批");

    // 没有 PF 资格的人不合格
    expect(byId.get(unqualifiedJudgeId)?.eligible).toBe(false);
    expect(byId.get(unqualifiedJudgeId)?.ineligibilityReasons.join("")).toContain("资格");

    // 已批准且有资格的人合格
    expect(byId.get(approvedJudgeId)?.eligible).toBe(true);

    // 不合格的人排在合格的人后面
    const firstIneligible = result?.candidates.findIndex((c) => !c.eligible) ?? -1;
    const lastEligible = (result?.candidates ?? []).map((c) => c.eligible).lastIndexOf(true);
    if (firstIneligible >= 0 && lastEligible >= 0) {
      expect(firstIneligible).toBeGreaterThan(lastEligible);
    }
  }, 60_000);

  it("本场还没有队伍时，明确说明无法统计「是否执裁过本场学生」", async () => {
    const result = await recommendJudgesForMatch(matchId, { injectedClient: supabase });
    expect(result?.warnings.join("")).toContain("还没有分配队伍");
  }, 60_000);

  it("指派落库；再指派到同一时间的另一场比赛会被拒绝", async () => {
    const ownerProfileId = (
      await supabase
        .from("profiles")
        .select("id")
        .eq("email", "judge-rec-owner@example.invalid")
        .single()
    ).data?.id as string;

    const { error: assignError } = await supabase.from("judge_assignments").insert({
      match_id: matchId,
      judge_id: approvedJudgeId,
      role: "chair",
      assigned_by: ownerProfileId,
    });
    expect(assignError).toBeNull();

    // 同一时间的第二场比赛
    const { data: second, error: secondError } = await supabase
      .from("matches")
      .insert({
        event_id: eventId,
        format_id: formatId,
        match_number: 2,
        room_name: "J102",
        scheduled_start: (
          await supabase.from("matches").select("scheduled_start").eq("id", matchId).single()
        ).data?.scheduled_start as string,
      })
      .select("id")
      .single();
    if (secondError) throw new Error(`创建第二场比赛失败：${secondError.message}`);

    const { error: conflicting } = await supabase.from("judge_assignments").insert({
      match_id: second?.id as string,
      judge_id: approvedJudgeId,
      role: "chair",
      assigned_by: ownerProfileId,
    });

    // P5-1 加的时间冲突触发器应当拦住
    expect(conflicting).not.toBeNull();
    expect(conflicting?.message).toContain("同一时间");

    // 排到**不同时间**则允许
    const { error: rescheduled } = await supabase
      .from("matches")
      .update({ scheduled_start: new Date(Date.now() + 5 * 86400_000).toISOString() })
      .eq("id", second?.id as string);
    expect(rescheduled).toBeNull();

    const { error: allowed } = await supabase.from("judge_assignments").insert({
      match_id: second?.id as string,
      judge_id: approvedJudgeId,
      role: "chair",
      assigned_by: ownerProfileId,
    });
    expect(allowed).toBeNull();
  }, 60_000);

  it("指派生效后再推荐，能看到这位裁判的工作量已经增加", async () => {
    const result = await recommendJudgesForMatch(matchId, { injectedClient: supabase });
    const approved = result?.candidates.find((c) => c.judgeId === approvedJudgeId);
    // 已有 2 条有效指派 → 工作量 2
    expect(approved?.components.workloadCountForEvent).toBe(2);
    expect(result?.assignedJudgeIds).toContain(approvedJudgeId);
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
      await supabase.from("match_roster_snapshots").delete().in("match_id", matchIds);
      await supabase.from("match_teams").delete().in("match_id", matchIds);
      await supabase.from("matches").delete().in("id", matchIds);
    }
    await supabase.from("judge_event_availability").delete().in("event_id", eventIds);
    await supabase.from("event_formats").delete().in("event_id", eventIds);
    await supabase.from("events").delete().in("id", eventIds);
  }

  const { data: judges } = await supabase
    .from("judge_profiles")
    .select("id, profiles!inner(email)")
    .like("profiles.email", "judge-%@example.invalid");

  type JudgeRow = { id: string };
  const judgeIds = ((judges ?? []) as unknown as JudgeRow[]).map((judge) => judge.id);
  if (judgeIds.length > 0) {
    await supabase.from("judge_format_qualifications").delete().in("judge_id", judgeIds);
    await supabase.from("judge_profiles").delete().in("id", judgeIds);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .like("email", "judge-%@example.invalid");
  const profileIds = (profiles ?? []).map((profile) => profile.id);
  const emails = (profiles ?? []).map((profile) => profile.email as string);

  if (profileIds.length > 0) {
    await supabase.from("audit_logs").delete().in("actor_profile_id", profileIds);
    await supabase.from("profiles").delete().in("id", profileIds);
  }

  // 幂等：认证账号也要删掉，否则下次运行会因为"邮箱已注册"而失败
  const { data: listing } = await supabase.auth.admin.listUsers();
  for (const email of emails) {
    const match = listing?.users.find((user) => user.email === email);
    if (match) await supabase.auth.admin.deleteUser(match.id);
  }
}
