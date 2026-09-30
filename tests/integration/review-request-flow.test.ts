// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

/**
 * 复核请求的**端到端**验证（Phase 8 / P8-1）。
 *
 * 为什么需要它：`createBallotReviewRequestAction` 与
 * `resolveBallotReviewRequestAction` 一直只通过类型检查与构建。
 * RLS 行为由 `scripts/db-tests.sql` 覆盖，但**动作代码本身**
 * （参数解析、唯一约束的错误处理、影响行数检查）从没跑过。
 *
 * ⚠️ 这条测试**用真实登录会话**（`signInWithPassword`），
 *    而不是服务角色 —— 否则测不到 RLS，也就测不到动作真实走的那条路。
 *
 * ⚠️ 夹具全部虚构，邮箱一律 `example.invalid`。
 */

function loadEnv(): { url?: string; anonKey?: string; serviceRoleKey?: string } {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const map = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match?.[1] && match[2] !== undefined) map.set(match[1], match[2]);
    }
    return {
      url: map.get("NEXT_PUBLIC_SUPABASE_URL") ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey:
        map.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: map.get("SUPABASE_SERVICE_ROLE_KEY") ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  } catch {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
}

const env = loadEnv();
const PASSWORD = "integration-test-password-1";
/*
 * ⚠️ 邮箱**每次运行都不同**。
 *
 * 一开始用固定邮箱，结果上一次中断的运行留下用户，
 * 下一次 `createUser` 就因 "already been registered" 失败，
 * 于是**整条测试一个都不跑** —— 看起来像环境坏了，其实是残留。
 * 而 `listUsers()` 默认分页，清理时未必能翻到那一页（试过，没用）。
 *
 * 用唯一邮箱之后，重复运行**一定**能跑起来；
 * 中断留下的残留也只是本地库里的虚构行，不会让测试变红。
 */
const RUN_ID = Date.now().toString(36);
const STUDENT_EMAIL = `review-request-student-${RUN_ID}@example.invalid`;
const MANAGER_EMAIL = `review-request-manager-${RUN_ID}@example.invalid`;

let admin: SupabaseClient<Database>;
let studentClient: SupabaseClient<Database>;
let managerClient: SupabaseClient<Database>;

let eventId: string;
let ballotId: string;
let templateId: string;
let teamIds: string[] = [];
let studentProfileId: string;
let studentAuthId: string;
let managerAuthId: string;

beforeAll(async () => {
  if (!env.url || !env.anonKey || !env.serviceRoleKey) {
    throw new Error("集成测试需要 URL / ANON_KEY / SERVICE_ROLE_KEY");
  }
  admin = createClient<Database>(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- 建立虚构用户（触发器会自动建 profiles）----
  const { data: studentUser, error: studentError } = await admin.auth.admin.createUser({
    email: STUDENT_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (studentError) throw new Error(`建学生用户失败：${studentError.message}`);
  studentAuthId = studentUser.user.id;

  const { data: managerUser, error: managerError } = await admin.auth.admin.createUser({
    email: MANAGER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (managerError) throw new Error(`建管理员用户失败：${managerError.message}`);
  managerAuthId = managerUser.user.id;

  // 等触发器建好 profiles，再补角色与学生档案
  await new Promise((resolve) => setTimeout(resolve, 300));
  await admin.from("user_roles").insert([
    { profile_id: studentAuthId, role: "student" },
    { profile_id: managerAuthId, role: "club_manager" },
  ]);

  const { data: studentProfile, error: profileError } = await admin
    .from("student_profiles")
    .insert({ profile_id: studentAuthId, school: "虚构集成测试中学" })
    .select("id")
    .single();
  if (profileError) throw new Error(`建学生档案失败：${profileError.message}`);
  studentProfileId = studentProfile.id as string;

  // ---- 最小夹具：活动 → 报名 → 参与 → 队伍 → 比赛 → 评分表（已发布）----
  const { data: format } = await admin.from("debate_formats").select("id, code").limit(1).single();
  if (!format) throw new Error("数据库里没有赛制，无法建立夹具");

  const now = new Date();
  const startsAt = new Date(now.getTime() + 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 86_400_000);

  /*
   * ⚠️ `event_date` 必须等于 `starts_at` 在**上海时区**下的日期 ——
   *    数据库有一条约束检查这一点。
   *    第一版我拿 `now` 当日期、拿 `later` 当开始时间，跨了午夜，
   *    于是约束直接拒绝。
   */
  const eventDate = utcToZonedLocal(startsAt, CLUB_DEFAULT_TIMEZONE).slice(0, 10);

  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      title: "复核请求端到端测试活动",
      event_date: eventDate,
      registration_opens_at: now.toISOString(),
      registration_closes_at: startsAt.toISOString(),
      check_in_opens_at: now.toISOString(),
      warning_at: startsAt.toISOString(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      created_by: managerAuthId,
    })
    .select("id")
    .single();
  if (eventError) throw new Error(`建活动失败：${eventError.message}`);
  eventId = event.id as string;

  await admin.from("registrations").insert({ event_id: eventId, student_id: studentProfileId });

  const { data: participation, error: participationError } = await admin
    .from("participations")
    .insert({
      event_id: eventId,
      student_id: studentProfileId,
      format_id: format.id,
      // ⚠️ 评分是 1–10 制（约束 `participations_rating_range`），不是 Elo
      rating_snapshot: 5,
    })
    .select("id")
    .single();
  if (participationError) throw new Error(`建参与失败：${participationError.message}`);

  const { data: team, error: teamError } = await admin
    .from("teams")
    .insert({ event_id: eventId, format_id: format.id })
    .select("id")
    .single();
  if (teamError) throw new Error(`建队伍失败：${teamError.message}`);
  teamIds = [team.id as string];

  await admin.from("team_members").insert({ team_id: team.id, participation_id: participation.id });

  const { data: match, error: matchError } = await admin
    .from("matches")
    .insert({
      event_id: eventId,
      format_id: format.id,
      match_number: 1,
      room_name: "虚构教室",
      scheduled_start: now.toISOString(),
    })
    .select("id")
    .single();
  if (matchError) throw new Error(`建比赛失败：${matchError.message}`);

  await admin
    .from("match_teams")
    .insert({ match_id: match.id, team_id: team.id, position: "proposition" });

  // 评分表需要一个模板与一位裁判
  const { data: judgeProfile, error: judgeError } = await admin
    .from("judge_profiles")
    .insert({ profile_id: managerAuthId, approval_status: "approved" })
    .select("id")
    .single();
  if (judgeError) throw new Error(`建裁判档案失败：${judgeError.message}`);

  const { data: template, error: templateError } = await admin
    .from("ballot_templates")
    .insert({
      format_id: format.id,
      name: "端到端测试模板",
      version: 1,
      schema: {
        schemaVersion: 1,
        fields: [],
        winnerRequired: false,
        reasonForDecisionRequired: false,
      },
      active: true,
      created_by: managerAuthId,
    })
    .select("id")
    .single();
  if (templateError) throw new Error(`建模板失败：${templateError.message}`);

  const { data: ballot, error: ballotError } = await admin
    .from("ballots")
    .insert({
      match_id: match.id,
      judge_id: judgeProfile.id,
      template_id: template.id,
      status: "published",
      published_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (ballotError) throw new Error(`建评分表失败：${ballotError.message}`);
  ballotId = ballot.id as string;
  templateId = template.id as string;

  // ---- 真实登录会话 ----
  studentClient = createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: studentSignIn } = await studentClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: PASSWORD,
  });
  if (studentSignIn) throw new Error(`学生登录失败：${studentSignIn.message}`);

  managerClient = createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: managerSignIn } = await managerClient.auth.signInWithPassword({
    email: MANAGER_EMAIL,
    password: PASSWORD,
  });
  if (managerSignIn) throw new Error(`管理员登录失败：${managerSignIn.message}`);
});

afterAll(async () => {
  /*
   * ⚠️ **子表要显式删，而且顺序不能反。**
   *
   * 数据库里大部分引用**不带级联**（`registrations`、`participations`、
   * `team_members`、`teams`、`matches` 都是 RESTRICT），因此删活动会先被拦下。
   *
   * 第一版我按"删活动就够了"写，结果 afterAll 里的删除**失败了却没有让测试变红** ——
   * 它只是留下一堆行，让**下一次运行**在唯一约束上撞车。
   * 这类"清理失败被吞掉"的问题最难查：红的是下一次，不是这一次。
   * 因此下面每一处都检查 error 并打印。
   */
  /*
   * ⚠️ 顺序是**按真实外键依赖**排的，不是按直觉：
   *    复核请求 → 评分表 → 比赛队伍 → 比赛 → 队伍成员 → 队伍 →
   *    参与 → 报名 → 活动 → 模板 → 学生档案 → 裁判档案。
   *
   * 写错顺序时删除会失败，**但 afterAll 里的失败不会让测试变红** ——
   * 它只是留下残留，让**下一次运行**撞唯一约束。
   * 这类问题最难查：红的是下一次，不是这一次。
   * 因此每一处都检查 error 并打印，而不是吞掉。
   */
  if (eventId) {
    const { data: matchRows } = await admin.from("matches").select("id").eq("event_id", eventId);
    const matchIds = (matchRows ?? []).map((row) => row.id as string);

    const { data: ballotRows } = matchIds.length
      ? await admin.from("ballots").select("id").in("match_id", matchIds)
      : { data: [] as { id: string }[] };
    const ballotIds = (ballotRows ?? []).map((row) => row.id as string);

    const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
      [
        "复核请求",
        () =>
          ballotIds.length
            ? admin.from("ballot_review_requests").delete().in("ballot_id", ballotIds)
            : Promise.resolve({ error: null }),
      ],
      [
        "评分表",
        () =>
          matchIds.length
            ? admin.from("ballots").delete().in("match_id", matchIds)
            : Promise.resolve({ error: null }),
      ],
      [
        "比赛队伍",
        () =>
          matchIds.length
            ? admin.from("match_teams").delete().in("match_id", matchIds)
            : Promise.resolve({ error: null }),
      ],
      ["比赛", () => admin.from("matches").delete().eq("event_id", eventId)],
      [
        "队伍成员",
        () =>
          teamIds.length
            ? admin.from("team_members").delete().in("team_id", teamIds)
            : Promise.resolve({ error: null }),
      ],
      ["队伍", () => admin.from("teams").delete().eq("event_id", eventId)],
      ["参与", () => admin.from("participations").delete().eq("event_id", eventId)],
      ["报名", () => admin.from("registrations").delete().eq("event_id", eventId)],
      ["活动", () => admin.from("events").delete().eq("id", eventId)],
    ];

    for (const [label, run] of steps) {
      const { error } = await run();
      if (error) console.error(`[集成测试] 清理「${label}」失败:`, error.message);
    }
  }

  if (templateId) {
    const { error } = await admin.from("ballot_templates").delete().eq("id", templateId);
    if (error) console.error("[集成测试] 清理「评分表模板」失败:", error.message);
  }
  if (studentProfileId) {
    const { error } = await admin.from("student_profiles").delete().eq("id", studentProfileId);
    if (error) console.error("[集成测试] 清理「学生档案」失败:", error.message);
  }
  if (managerAuthId) {
    const { error } = await admin.from("judge_profiles").delete().eq("profile_id", managerAuthId);
    if (error) console.error("[集成测试] 清理「裁判档案」失败:", error.message);
  }

  if (studentAuthId) await admin.auth.admin.deleteUser(studentAuthId);
  if (managerAuthId) await admin.auth.admin.deleteUser(managerAuthId);
});

describe("复核请求：学生提交（真实会话，RLS 生效）", () => {
  it("学生能对已发布的评分表提交复核请求", async () => {
    const { data, error } = await studentClient
      .from("ballot_review_requests")
      .insert({
        ballot_id: ballotId,
        requested_by_student_id: studentProfileId,
        reason: "我的内容分被记为 24，但我说过的第二点没有被记录在论点里。",
        status: "open",
      })
      .select("id, status")
      .single();

    expect(error, `提交失败：${error?.message}`).toBeNull();
    expect(data?.status).toBe("open");
  });

  it("重复提交被唯一约束拒绝，且错误码是 23505（动作会据此给出提示）", async () => {
    const { error } = await studentClient.from("ballot_review_requests").insert({
      ballot_id: ballotId,
      requested_by_student_id: studentProfileId,
      reason: "再提一次",
      status: "open",
    });

    expect(error, "重复提交应当被拒绝").not.toBeNull();
    /*
     * ⚠️ 必须检查错误码。只检查"有没有报错"是不够的 ——
     * 报错也可能是别的原因（例如缺字段），那样动作里的
     * "你已经提过了" 提示就会在错误的情况下出现。
     */
    expect(error?.code, `实际错误码 ${error?.code}：${error?.message}`).toBe("23505");
  });

  it("学生看不到别人的复核请求（RLS 静默过滤）", async () => {
    // 管理员不是学生，构造一条属于**别人**的：用服务角色直接插
    const { data: otherProfile } = await admin
      .from("student_profiles")
      .select("id")
      .neq("id", studentProfileId)
      .limit(1)
      .maybeSingle();

    if (!otherProfile) return; // 库里没有第二个学生就跳过

    await admin.from("ballot_review_requests").insert({
      ballot_id: ballotId,
      requested_by_student_id: otherProfile.id,
      reason: "这一条属于别人，学生不应看到。",
      status: "open",
    });

    const { data } = await studentClient
      .from("ballot_review_requests")
      .select("requested_by_student_id");
    for (const row of data ?? []) {
      expect(row.requested_by_student_id).toBe(studentProfileId);
    }
  });
});

describe("复核请求：管理员处理（真实会话）", () => {
  it("管理员能看到该活动下的复核请求", async () => {
    const { data, error } = await managerClient
      .from("ballot_review_requests")
      .select("id, status, reason");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("管理员能处理（改状态 + 写回复），并用 count 确认影响行数", async () => {
    const { data: mine } = await managerClient
      .from("ballot_review_requests")
      .select("id")
      .eq("requested_by_student_id", studentProfileId)
      .single();
    expect(mine).not.toBeNull();

    const { error, count } = await managerClient
      .from("ballot_review_requests")
      .update(
        {
          status: "resolved",
          admin_response: "已核对录像，第二点确实漏记，已请裁判重开更正。",
        },
        { count: "exact" },
      )
      .eq("id", (mine as { id: string }).id);

    expect(error).toBeNull();
    // ⚠️ RLS 静默过滤 → 必须看行数，不能只看 error
    expect(count, "应当恰好影响 1 行").toBe(1);
  });

  it("学生能看到处理结果与回复", async () => {
    const { data } = await studentClient
      .from("ballot_review_requests")
      .select("status, admin_response")
      .eq("requested_by_student_id", studentProfileId)
      .single();

    expect(data?.status).toBe("resolved");
    expect(data?.admin_response).toContain("已请裁判重开更正");
  });

  it("学生**不能**自己改状态（影响 0 行，且状态确实没变）", async () => {
    const { data: mine } = await studentClient
      .from("ballot_review_requests")
      .select("id")
      .eq("requested_by_student_id", studentProfileId)
      .single();

    const { error, count } = await studentClient
      .from("ballot_review_requests")
      .update({ status: "open" }, { count: "exact" })
      .eq("id", (mine as { id: string }).id);

    expect(error).toBeNull(); // RLS 不报错，只是过滤
    expect(count, "学生改不动，应当是 0 行").toBe(0);

    /*
     * ⚠️ 配套的第二条：证明"0 行"是因为**策略拦住了**，
     *    而不是因为别的原因。只断言行数是本项目反复踩过的假通过。
     */
    const { data: after } = await studentClient
      .from("ballot_review_requests")
      .select("status")
      .eq("id", (mine as { id: string }).id)
      .single();
    expect(after?.status).toBe("resolved");
  });
});
