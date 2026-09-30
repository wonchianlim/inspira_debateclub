// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { CLUB_DEFAULT_TIMEZONE, zonedDateOf } from "@/lib/domain/timezone";

/**
 * 配对生成的**集成测试**（Phase 4 / P4-5 的生成流程）。
 *
 * 为什么需要这一条：
 * `lib/admin/pairing.ts` 是 server-only 的，正常路径依赖 Next 的请求上下文来构造
 * 用户身份客户端，因此**无法用单元测试覆盖**。上一步（P4-5）只做了类型检查与构建，
 * 我在报告里明确写了"尚未端到端验证"。
 *
 * 这条测试用**注入的服务角色客户端**真的跑一遍：建虚构数据 → 生成 → 断言落库结果。
 * 它覆盖的是**数据库读写这一段**（查询、插入、删除旧队伍、保留已锁定队伍）。
 *
 * ⚠️ 它用服务角色，因此**不覆盖 RLS**。权限由 `scripts/db-tests.sql` 单独覆盖。
 *
 * ⚠️ 全部是虚构数据，邮箱一律用 `example.invalid`，绝不涉及真实学生。
 */

function loadEnv(): { url?: string; serviceRoleKey?: string } {
  // 优先读 .env.local（本地开发由 `supabase status -o env` 生成）
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
const databaseAvailable = Boolean(env.url && env.serviceRoleKey);

/*
 * 数据库没起来时**明确跳过**，而不是静默通过。
 * 静默通过会让"这一条测试其实从没跑过"这件事被掩盖掉 —— 那正是本项目一直在防的假通过。
 */
const describeWithDatabase = databaseAvailable ? describe : describe.skip;

if (!databaseAvailable) {
  console.warn(
    "[集成测试] 未找到本地数据库配置，配对生成流程的集成测试被跳过。" +
      "请先运行 `supabase start` 并生成 .env.local。",
  );
}

describeWithDatabase("配对生成（集成，使用真实数据库）", () => {
  let supabase: SupabaseClient<Database>;
  let eventId: string;
  let studentIds: string[];

  beforeAll(async () => {
    supabase = createClient<Database>(env.url as string, env.serviceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await cleanup(supabase);

    /*
     * ⚠️ `profiles.id` 外键指向 `auth.users(id)`，因此**必须先建认证账号**，
     * 才能插入档案。直接插 profiles 会因外键失败 ——
     * 第一次跑这条测试时就是这么失败的（报错是"创建活动失败"，
     * 因为档案没建成，活动的外键自然也就找不到人）。
     */
    const ownerEmail = "pairing-owner@example.invalid";
    const studentEmails = [1, 2, 3, 4].map((index) => `pairing-student-${index}@example.invalid`);

    /*
     * 幂等：认证账号已存在时**复用**，而不是报错。
     *
     * AGENTS.md 要求"容易重复执行的命令必须幂等"。上一次失败或中断的运行
     * 可能留下账号，如果这里直接 createUser 就会报"邮箱已注册"，
     * 让下一次运行也失败 —— 测试会陷入"必须手工清库才能跑"的状态。
     */
    const ensureAuthUser = async (email: string): Promise<string> => {
      const { data: listing, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw new Error(`列出认证账号失败：${listError.message}`);

      const existing = listing?.users.find((user) => user.email === email);
      if (existing) return existing.id;

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: "PairingTest123!",
        email_confirm: true,
      });
      if (error) throw new Error(`创建认证账号失败（${email}）：${error.message}`);
      return data.user?.id as string;
    };

    const ownerProfileId = await ensureAuthUser(ownerEmail);
    const studentAuthIds: string[] = [];
    for (const email of studentEmails) studentAuthIds.push(await ensureAuthUser(email));

    /*
     * ⚠️ **不要手工插入 profiles**。
     *
     * `auth.users` 上有 `on_auth_user_created` 触发器，会自动建好对应的档案。
     * 手工再插一次会撞 `profiles_pkey` —— 第一次跑这条测试时就报了这个错，
     * 而错误信息看起来像"主键重复"，跟真正的原因（档案已经被自动建好了）并不直接对应。
     */
    studentIds = studentAuthIds;

    const { data: createdProfiles, error: profileReadError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", [ownerProfileId, ...studentIds]);
    if (profileReadError) throw new Error(`读取自动创建的档案失败：${profileReadError.message}`);
    if ((createdProfiles ?? []).length !== studentIds.length + 1) {
      throw new Error(
        `自动创建的档案数量不对：期望 ${studentIds.length + 1}，实际 ${(createdProfiles ?? []).length}。`,
      );
    }
    const { error: studentProfileError } = await supabase
      .from("student_profiles")
      .insert(studentIds.map((studentId) => ({ profile_id: studentId })));
    if (studentProfileError)
      throw new Error(`创建学生学业档案失败：${studentProfileError.message}`);

    // 学生档案 id 由数据库生成，这里查回来用于后续外键
    const { data: studentProfiles } = await supabase
      .from("student_profiles")
      .select("id, profile_id")
      .in("profile_id", studentIds);

    const studentProfileByProfileId = new Map(
      (studentProfiles ?? []).map((row) => [row.profile_id as string, row.id as string] as const),
    );

    const studentProfileIds = studentIds.map(
      (studentId) => studentProfileByProfileId.get(studentId) as string,
    );
    if (studentProfileIds.some((value) => !value)) {
      throw new Error("有学生档案没有查到 id，测试数据不完整。");
    }

    // --- 活动（PF 与 WSDC 两个赛制） ---
    // ⚠️ 每次写入都检查 error：否则写入失败会让后续断言报出**误导性的原因**
    //    （例如"找不到这个活动"，而真正的问题是 profile 少了一列）。
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        title: "配对集成测试活动",
        /*
         * ⚠️ event_date 必须按**活动时区**推导，不能取 UTC 日期。
         *
         * 数据库约束要求它等于 starts_at 在 Asia/Shanghai 下的日期。
         * 用 `toISOString().slice(0, 10)` 会在 UTC 16:00–24:00 之间
         * （北京 0:00–8:00）差一天，**测试因此只在深夜失败**。
         *
         * 这个 bug 在 2026-10-01 凌晨真的发生了：白天跑都过，凌晨跑三个文件全红。
         */
        event_date: zonedDateOf(new Date(Date.now() + 3 * 86400_000), CLUB_DEFAULT_TIMEZONE),
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

    const { data: formats } = await supabase.from("debate_formats").select("id, code");
    const pf = formats?.find((format) => format.code === "PF")?.id as string;
    const wsdc = formats?.find((format) => format.code === "WSDC")?.id as string;

    const { error: eventFormatsError } = await supabase.from("event_formats").insert([
      { event_id: eventId, format_id: pf, enabled: true },
      { event_id: eventId, format_id: wsdc, enabled: true },
    ]);
    if (eventFormatsError) throw new Error(`启用赛制失败：${eventFormatsError.message}`);

    // --- 报名（全部"已报名"= 可用） ---
    /*
     * ⚠️ 学生 id 必须用**查回来的 studentProfileIds**，不能用固定后缀拼出来。
     *
     * 之前这里用 `id("2" + studentId.slice(-2))` 拼了一个不存在的 id，
     * 插入因外键失败 —— 而错误**没有被检查**，于是"报名"静默地一条都没写进去，
     * 后面表现为"生成出 0 支队伍"，排查方向完全被带偏。
     * 教训：测试数据写入必须检查 error；任何一处静默失败都会伪装成业务逻辑的问题。
     */
    const { error: registrationError } = await supabase.from("registrations").insert(
      studentProfileIds.map((studentProfileId) => ({
        event_id: eventId,
        student_id: studentProfileId,
      })),
    );
    if (registrationError) throw new Error(`写入报名失败：${registrationError.message}`);

    // --- 赛制资格：四人全部合格 PF ---
    const { error: eligibilityError } = await supabase.from("student_format_profiles").insert(
      /*
       * ⚠️ 两个约束必须同时满足：
       *   1. `eligible` 的默认值是 **false**（资格由超级管理员授予），要测试主流程必须显式给 true；
       *   2. 有 `student_format_profiles_eligible_needs_rating` 约束 ——
       *      **判定为合格就必须同时给出 1-10 的评分**。
       *      只给 eligible 不给 rating 会直接违反约束（实测踩到）。
       */
      studentProfileIds.map((studentProfileId, index) => ({
        student_id: studentProfileId,
        format_id: pf,
        eligible: true,
        rating: [3, 4, 7, 8][index],
        updated_by: ownerProfileId,
      })),
    );
    if (eligibilityError) throw new Error(`写入赛制资格失败：${eligibilityError.message}`);

    /*
     * --- 赛制偏好 ---
     *
     * ⚠️ **必须有偏好，否则引擎一个人都不会分配。**
     *
     * 第一次跑这条测试时给出了 0 支队伍：四位学生都合格 PF，但谁都没有填偏好，
     * 于是分配引擎按规范把他们全部列为"需要管理员处理"。
     * 这是**正确行为**（规范第 10.2 节要求按志愿分配，
     * P3-6 的管理员视图也会把"未填写偏好"标成待处理），
     * 但测试数据不完整就测不到主流程。
     */
    const { data: registrationsCreated, error: registrationReadError } = await supabase
      .from("registrations")
      .select("id, student_id")
      .eq("event_id", eventId);
    if (registrationReadError) {
      throw new Error(`读取报名失败：${registrationReadError.message}`);
    }

    const { error: preferenceError } = await supabase
      .from("registration_format_preferences")
      .insert(
        (registrationsCreated ?? []).map((registration) => ({
          registration_id: registration.id,
          format_id: pf,
          preference_rank: 1,
        })),
      );
    if (preferenceError) throw new Error(`写入赛制偏好失败：${preferenceError.message}`);

    // --- 参与记录：评分 3、4、7、8（便于断言"评分相近的人被分到一起"） ---
    const ratings = [3, 4, 7, 8];
    const { error: participationError } = await supabase.from("participations").insert(
      studentProfileIds.map((studentProfileId, index) => ({
        event_id: eventId,
        student_id: studentProfileId,
        format_id: pf,
        rating_snapshot: ratings[index] as number,
        status: "confirmed" as const,
      })),
    );
    if (participationError) throw new Error(`写入参与失败：${participationError.message}`);
  }, 60_000);

  afterAll(async () => {
    if (supabase) await cleanup(supabase);
  }, 60_000);

  it("生成成功，并写入提案、队伍与队伍成员", async () => {
    const { generatePairingProposal } = await import("@/lib/admin/pairing");
    const result = await generatePairingProposal(eventId, supabase);

    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;

    // 提案本身
    const { data: proposal } = await supabase
      .from("pairing_proposals")
      .select("algorithm_version, input_snapshot, warnings, summary")
      .eq("id", result.proposalId)
      .single();

    expect(proposal?.algorithm_version).toBeTruthy();
    expect(proposal?.summary).toBeTruthy();

    // 队伍：四人打 PF（2 人一队）→ 2 支队伍
    const { data: teams } = await supabase.from("teams").select("id").eq("event_id", eventId);
    expect(teams).toHaveLength(2);

    // 队伍成员：每条队伍 2 人
    const teamIds = (teams ?? []).map((team) => team.id);
    const { data: members } = await supabase
      .from("team_members")
      .select("team_id")
      .in("team_id", teamIds);
    expect(members).toHaveLength(4);
  }, 60_000);

  it("评分相近的人被分到一起（3+4 一队、7+8 一队）", async () => {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, team_members(participations(student_id, rating_snapshot))")
      .eq("event_id", eventId);

    type TeamRow = {
      id: string;
      team_members:
        { participations: { student_id: string; rating_snapshot: number } | null }[] | null;
    };

    const ratingGroups = ((teams ?? []) as unknown as TeamRow[]).map((team) =>
      (team.team_members ?? [])
        .map((member) => member.participations?.rating_snapshot)
        .filter((value): value is number => typeof value === "number")
        .sort((a, b) => a - b),
    );

    expect(ratingGroups).toHaveLength(2);
    expect(ratingGroups).toContainEqual([3, 4]);
    expect(ratingGroups).toContainEqual([7, 8]);
  }, 60_000);

  it("输入快照里**不含**姓名或邮箱（只存算法输入）", async () => {
    const { data: proposals } = await supabase
      .from("pairing_proposals")
      .select("input_snapshot")
      .eq("event_id", eventId);
    const serialized = JSON.stringify(proposals);
    expect(serialized).not.toContain("@example.invalid");
    expect(serialized).not.toContain("虚构学生");
  }, 60_000);

  it("重新生成会替换未锁定的队伍（不残留旧队伍）", async () => {
    const { generatePairingProposal } = await import("@/lib/admin/pairing");
    const result = await generatePairingProposal(eventId, supabase);
    expect(result.ok).toBe(true);

    const { data: teams } = await supabase.from("teams").select("id").eq("event_id", eventId);
    // 仍然是 2 支，而不是 4 支（旧队伍没有被留下）
    expect(teams).toHaveLength(2);
  }, 60_000);

  it("**锁定的队伍在重新生成时被保留**（规范 10.7 第 3 条）", async () => {
    // 先锁一支现有队伍，并给它一个可识别的标记
    const { data: existing } = await supabase
      .from("teams")
      .select("id, team_members(participation_id)")
      .eq("event_id", eventId)
      .limit(1)
      .single();

    const lockedTeamId = existing?.id as string;
    const lockedMembers = (existing?.team_members ?? [])
      .map((member) => member.participation_id)
      .sort();

    await supabase.from("teams").update({ locked: true }).eq("id", lockedTeamId);

    const { generatePairingProposal } = await import("@/lib/admin/pairing");
    const result = await generatePairingProposal(eventId, supabase);
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (result.ok) expect(result.preservedTeamCount).toBe(1);

    // 锁定的那支队伍**还在**，成员**没有变**
    const { data: stillThere } = await supabase
      .from("teams")
      .select("id, locked, team_members(participation_id)")
      .eq("id", lockedTeamId)
      .maybeSingle();

    expect(stillThere, "锁定的队伍被重新生成删掉了").not.toBeNull();
    expect(stillThere?.locked).toBe(true);

    const membersNow = (stillThere?.team_members ?? [])
      .map((member) => member.participation_id)
      .sort();
    expect(membersNow).toEqual(lockedMembers);
  }, 60_000);

  it("确定性与可重复：同一输入连续生成两次，队伍构成一致", async () => {
    const { generatePairingProposal } = await import("@/lib/admin/pairing");

    // 先解锁，避免上一条测试的锁定影响
    await supabase.from("teams").update({ locked: false }).eq("event_id", eventId);

    await generatePairingProposal(eventId, supabase);
    const first = await readTeamSignature(supabase, eventId);
    await generatePairingProposal(eventId, supabase);
    const second = await readTeamSignature(supabase, eventId);

    expect(second).toEqual(first);
  }, 90_000);
});

/** 把当前队伍构成读成一个可比较的签名（与生成顺序无关）。 */
async function readTeamSignature(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<string[]> {
  const { data: teams } = await supabase
    .from("teams")
    .select("team_members(participations(student_id, rating_snapshot))")
    .eq("event_id", eventId);

  type TeamRow = {
    team_members:
      { participations: { student_id: string; rating_snapshot: number } | null }[] | null;
  };

  return ((teams ?? []) as unknown as TeamRow[])
    .map((team) =>
      (team.team_members ?? [])
        .map(
          (member) =>
            `${member.participations?.student_id}:${member.participations?.rating_snapshot}`,
        )
        .sort()
        .join(","),
    )
    .sort();
}

/** 清理本次集成测试造出的全部虚构数据（顺序必须符合外键依赖）。 */
async function cleanup(supabase: SupabaseClient<Database>): Promise<void> {
  const { data: events } = await supabase
    .from("events")
    .select("id")
    .eq("title", "配对集成测试活动");
  const eventIds = (events ?? []).map((event) => event.id);

  if (eventIds.length > 0) {
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
    await supabase.from("pairing_proposals").delete().in("event_id", eventIds);
    await supabase.from("partner_requests").delete().in("event_id", eventIds);
    await supabase
      .from("registration_format_preferences")
      .delete()
      .in(
        "registration_id",
        (
          (await supabase.from("registrations").select("id").in("event_id", eventIds)).data ?? []
        ).map((registration) => registration.id),
      );
    await supabase.from("registrations").delete().in("event_id", eventIds);
    await supabase.from("participations").delete().in("event_id", eventIds);
    await supabase.from("event_formats").delete().in("event_id", eventIds);
    await supabase.from("events").delete().in("id", eventIds);
  }

  // 学生档案与账号
  const { data: students } = await supabase
    .from("profiles")
    .select("id, email")
    .like("email", "pairing-%@example.invalid");
  const profileIds = (students ?? []).map((profile) => profile.id);
  const profileEmails = (students ?? []).map((profile) => profile.email as string);

  if (profileIds.length > 0) {
    await supabase
      .from("student_format_profiles")
      .delete()
      .in(
        "student_id",
        (
          (await supabase.from("student_profiles").select("id").in("profile_id", profileIds))
            .data ?? []
        ).map((student) => student.id),
      );
    await supabase.from("student_profiles").delete().in("profile_id", profileIds);
    await supabase.from("audit_logs").delete().in("actor_profile_id", profileIds);
    await supabase.from("profiles").delete().in("id", profileIds);
  }

  /*
   * 认证账号也要删掉，否则下次运行会因为"邮箱已注册"而失败，
   * 或者留下无人引用的账号。删除必须放在 profiles 之后（有外键）。
   */
  for (const email of profileEmails) {
    const { data: listing } = await supabase.auth.admin.listUsers();
    const match = listing?.users.find((user) => user.email === email);
    if (match) await supabase.auth.admin.deleteUser(match.id);
  }
}
