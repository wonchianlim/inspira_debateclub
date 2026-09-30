// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import {
  canSubmitBallot,
  computeBallotTotals,
  validateBallotTemplate,
} from "@/lib/domain/ballot-schema";
import { OFFICIAL_TEMPLATES } from "@/lib/domain/official-templates";

/**
 * 官方模板的**端到端存取验证**（Phase 7 / P7-3）。
 *
 * 为什么要这一条：整套评分表机制都建立在"模板以 JSONB 存进数据库、
 * 读回来还是同一个 schema"这个假设上。类型检查与单元测试**都验证不了这一点** ——
 * 它们只证明代码里的对象是对的，不证明它穿过 Postgres 之后还对。
 *
 * ⚠️ 用服务角色客户端，因此**不覆盖 RLS**（权限由 `scripts/db-tests.sql` 覆盖）。
 * ⚠️ 全部虚构数据。
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

const env = loadEnv();
let client: SupabaseClient<Database>;
let createdProfileId: string | null = null;
const insertedTemplateIds: string[] = [];

const TEST_EMAIL = "ballot-template-integration@example.invalid";

beforeAll(async () => {
  if (!env.url || !env.serviceRoleKey) {
    throw new Error("集成测试需要 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
  }
  client = createClient<Database>(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /*
   * `ballot_templates.created_by` 是 **NOT NULL** 且外键指向档案，
   * 而迁移后的库**没有任何用户**。因此这里建一个虚构用户 ——
   * `on_auth_user_created` 触发器会自动建出对应档案。
   *
   * ⚠️ 不要手动 insert profiles：那会与触发器冲突（本项目踩过一次）。
   */
  const { data: created, error } = await client.auth.admin.createUser({
    email: TEST_EMAIL,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) {
    throw new Error(`无法建立集成测试用户：${error.message}`);
  }

  if (created?.user) {
    createdProfileId = created.user.id;
  } else {
    // 已存在（上次运行残留）→ 从 auth 列表里找回来
    const { data: list } = await client.auth.admin.listUsers();
    const existing = list?.users.find((user) => user.email === TEST_EMAIL);
    createdProfileId = existing?.id ?? null;
  }

  // 等触发器建好档案
  for (let attempt = 0; attempt < 20 && createdProfileId === null; attempt += 1) {
    const { data } = await client.from("profiles").select("id").limit(1).maybeSingle();
    createdProfileId = (data?.id as string | undefined) ?? null;
    if (createdProfileId === null) await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

afterAll(async () => {
  // 只删自己插入的行，不动种子数据
  if (insertedTemplateIds.length > 0) {
    await client.from("ballot_templates").delete().in("id", insertedTemplateIds);
  }
  if (createdProfileId) {
    await client.auth.admin.deleteUser(createdProfileId);
  }
});

/**
 * `ballot_templates.created_by` 是 **NOT NULL**，因此必须给一个真实存在的档案 id。
 *
 * ⚠️ 这一点第一版没注意到：插入因为 created_by 为空而失败，
 * 那条"数据库拒绝非法 schema"的测试**恰好也失败了**，于是显示"通过" ——
 * 但它通过的**原因与它声称的完全无关**。这是本项目反复遇到的假通过。
 */
async function anyProfileId(): Promise<string | null> {
  if (createdProfileId) return createdProfileId;
  const { data } = await client.from("profiles").select("id").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function formatIdFor(code: string): Promise<string | null> {
  const { data } = await client.from("debate_formats").select("id").eq("code", code).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

describe("官方模板在数据库里能存取", () => {
  it("四份模板的 schema 穿过 JSONB 之后**完全一致**（含列表子字段与总项）", async () => {
    const createdBy = await anyProfileId();
    expect(createdBy, "集成测试库里没有任何档案，无法建立模板").not.toBeNull();

    for (const [formatCode, entry] of Object.entries(OFFICIAL_TEMPLATES)) {
      const formatId = await formatIdFor(formatCode);
      if (!formatId) continue; // 本地库里没有这个赛制就跳过

      const { data: inserted, error } = await client
        .from("ballot_templates")
        .insert({
          format_id: formatId,
          name: `集成测试 · ${entry.name}`,
          version: 900,
          schema: JSON.parse(JSON.stringify(entry.schema)) as never,
          active: false,
          created_by: createdBy as string,
        })
        .select("id, schema")
        .single();

      expect(error, `${formatCode} 写入失败：${error?.message}`).toBeNull();
      if (!inserted) continue;
      insertedTemplateIds.push(inserted.id as string);

      /*
       * ⚠️ 这是本条测试的核心断言。
       *
       * JSONB **不保留对象键的顺序**，因此不能用字符串比较 ——
       * 那会因为键顺序不同而假失败。这里比较结构化相等，
       * 正是"穿过数据库之后语义是否一致"这个问题该问的方式。
       */
      expect(inserted.schema, `${formatCode} 的 schema 穿过 JSONB 后变了`).toEqual(entry.schema);

      // 而且读回来的模板仍然是**合法**的（校验器认得它）
      const validation = validateBallotTemplate(inserted.schema as unknown as typeof entry.schema);
      expect(validation.valid, `${formatCode}: ${JSON.stringify(validation.issues)}`).toBe(true);
    }
  });

  it("✓ 至少验证了一份模板（防止因赛制缺失而空跑成假通过）", () => {
    // 如果所有赛制都查不到，上面的循环会一条也不测就"通过"
    expect(insertedTemplateIds.length).toBeGreaterThan(0);
  });

  it("数据库拒绝格式不合法的 schema（不是随便什么 JSON 都能存）", async () => {
    const formatId = await formatIdFor("PF");
    const createdBy = await anyProfileId();
    if (!formatId || !createdBy) return;

    // 先证明**合法**的 schema 能存进去 —— 否则下一条也会因为别的原因失败而"通过"
    const { data: ok, error: okError } = await client
      .from("ballot_templates")
      .insert({
        format_id: formatId,
        name: "集成测试 · 合法 schema 对照",
        version: 901,
        schema: JSON.parse(JSON.stringify(OFFICIAL_TEMPLATES.PF.schema)) as never,
        active: false,
        created_by: createdBy,
      })
      .select("id")
      .single();
    expect(okError, "合法 schema 应当能存进去").toBeNull();
    if (ok) insertedTemplateIds.push(ok.id as string);

    // 再证明**数组**被拒绝 —— 两个插入只差 schema 一个字段
    const { error } = await client
      .from("ballot_templates")
      .insert({
        format_id: formatId,
        name: "集成测试 · 非法 schema",
        version: 902,
        schema: [1, 2, 3] as never,
        active: false,
        created_by: createdBy,
      })
      .select("id")
      .single();

    expect(error, "数组形态的 schema 应当被数据库拒绝").not.toBeNull();
    // 而且是**check 约束**拒绝的，不是因为缺字段之类的别的原因
    expect(error?.code, `实际错误码 ${error?.code}：${error?.message}`).toBe("23514");
  });
});

/**
 * 用**真实读回来的** schema 跑一遍完整流程。
 *
 * 这一步把"存进去的还是原来那个模板"变成"用它算分与校验的结果仍然正确"。
 */
describe("用数据库里的模板算分与校验", () => {
  it("PF：从数据库读回的模板能算出队伍总分并拒绝 Low Point Win", async () => {
    const formatId = await formatIdFor("PF");
    if (!formatId) return;

    const { data: inserted } = await client
      .from("ballot_templates")
      .insert({
        format_id: formatId,
        name: "集成测试 · PF 全流程",
        version: 903,
        schema: JSON.parse(JSON.stringify(OFFICIAL_TEMPLATES.PF.schema)) as never,
        active: false,
        created_by: (await anyProfileId()) as string,
      })
      .select("id, schema")
      .single();
    if (!inserted) return;
    insertedTemplateIds.push(inserted.id as string);

    const schema = inserted.schema as unknown as typeof OFFICIAL_TEMPLATES.PF.schema;

    const data = {
      speakerValues: {
        "pro-1": {
          argumentation: 10,
          rebuttal: 8,
          strategy: 6,
          delivery: 4,
          crossfire_teamwork: 2,
        },
        "pro-2": {
          argumentation: 9,
          rebuttal: 7,
          strategy: 6,
          delivery: 4,
          crossfire_teamwork: 1.5,
        },
        "con-1": {
          argumentation: 10,
          rebuttal: 8,
          strategy: 6,
          delivery: 4,
          crossfire_teamwork: 2,
        },
        "con-2": {
          argumentation: 10,
          rebuttal: 8,
          strategy: 6,
          delivery: 4,
          crossfire_teamwork: 2,
        },
      },
      teamValues: {},
      matchValues: {
        reason_for_decision: "这是一段足够长的判决理由，用于通过最少字数之外的形状校验。".repeat(4),
      },
    };

    const { teamTotals } = computeBallotTotals(schema, data, {
      teamMembersByTeam: { pro: ["pro-1", "pro-2"], con: ["con-1", "con-2"] },
    });
    expect(teamTotals.pro?.team_points).toBe(57.5);
    expect(teamTotals.con?.team_points).toBe(60);

    // 胜方选了分数更低的 pro → 必须被拒绝
    const result = canSubmitBallot(schema, data, {
      winnerTeamId: "pro",
      reasonForDecision: (data.matchValues.reason_for_decision as string) ?? null,
      expectedIds: {
        studentIds: ["pro-1", "pro-2", "con-1", "con-2"],
        teamIds: ["pro", "con"],
      },
      teamMembersByTeam: { pro: ["pro-1", "pro-2"], con: ["con-1", "con-2"] },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("Low Point Win");
  });

  it("WSDC：从数据库读回的模板仍然强制 60–80 的硬性区间", async () => {
    const formatId = await formatIdFor("WSDC");
    if (!formatId) return;

    const { data: inserted } = await client
      .from("ballot_templates")
      .insert({
        format_id: formatId,
        name: "集成测试 · WSDC 区间",
        version: 904,
        schema: JSON.parse(JSON.stringify(OFFICIAL_TEMPLATES.WSDC.schema)) as never,
        active: false,
        created_by: (await anyProfileId()) as string,
      })
      .select("id, schema")
      .single();
    if (!inserted) return;
    insertedTemplateIds.push(inserted.id as string);

    const schema = inserted.schema as unknown as typeof OFFICIAL_TEMPLATES.WSDC.schema;
    expect(schema.totals?.find((total) => total.key === "speaker_total")?.hardMin).toBe(60);
    expect(schema.totals?.find((total) => total.key === "speaker_total")?.hardMax).toBe(80);

    // 59 分必须被拒绝（产品负责人明确要求）
    const lowScore = {
      speakerValues: { "p-1": { style: 24, content: 24, strategy: 11 } },
      teamValues: {},
      matchValues: {},
    };
    const result = canSubmitBallot(schema, lowScore, {
      winnerTeamId: null,
      reasonForDecision: null,
      expectedIds: { studentIds: ["p-1"] },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("")).toContain("59");
  });
});
