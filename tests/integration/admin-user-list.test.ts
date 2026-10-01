// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { PROFILE_COLUMNS } from "@/lib/admin/users";

/**
 * 用户列表的查询**在真实的 PostgREST 上**不会崩。
 *
 * ⚠️ 这个文件的存在理由是一次真实的生产故障（2026-10-01）：
 *
 *   `/admin/users` 显示"共 0 个账号" —— **连超管自己都不在列表里**。
 *   服务器日志里的真话是：
 *     `Could not embed because more than one relationship was found
 *      for 'profiles' and 'user_roles'`（PostgREST **PGRST201** / HTTP 300）
 *
 *   原因：`user_roles` 有**两条**外键指向 `profiles`
 *   （`profile_id` 表示"谁拥有这个角色"，`created_by` 表示"谁授予的"），
 *   因此 `user_roles(role)` 这种写法 PostgREST 不知道该走哪一条。
 *   而 `listProfiles` 出错后返回空数组、页面把它显示成"没有人"，
 *   于是**故障伪装成了"没有数据"**。
 *
 * ⚠️ 为什么单元测试抓不到它：单元测试用的是**假的** Supabase 客户端，
 *   而这是 PostgREST **查询规划阶段**的错误 —— 只有真的发一次请求才会出现。
 *   所以这里直接打本地 PostgREST。
 *
 * ⚠️ 并且**反向确认**也写在里面（第二、三条用例）：
 *   如果哪一天"旧写法也不报错了"，说明这个测试已经不再验证任何东西 ——
 *   那是检查失效，不是代码变好了。本项目在"静默通过的检查"上吃过大亏。
 */

type Env = { url: string; serviceRoleKey: string };

function loadEnv(): Env {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const map = new Map<string, string>();
    for (const line of raw.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match?.[1] && match[2] !== undefined) map.set(match[1], match[2].replace(/^"|"$/g, ""));
    }
    return {
      url: map.get("NEXT_PUBLIC_SUPABASE_URL") ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey:
        map.get("SUPABASE_SERVICE_ROLE_KEY") ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    };
  } catch {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    };
  }
}

let env: Env;

/** 直接向 PostgREST 发一次读取请求（service-role，因此不受 RLS 影响）。 */
async function restGet(pathAndQuery: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
    },
  });
  return { status: response.status, body: await response.text() };
}

beforeAll(() => {
  env = loadEnv();
  if (!env.url || !env.serviceRoleKey) {
    throw new Error("这个集成测试需要本地 Supabase（.env.local 里的 URL 与 service role key）");
  }
});

describe("用户列表的查询不会撞上「关系不唯一」", () => {
  it("代码里那份列清单能真的跑通（PGRST201 = 关系不唯一）", async () => {
    const select = encodeURIComponent(PROFILE_COLUMNS);
    const { status, body } = await restGet(`profiles?select=${select}&limit=1`);

    expect(body, "又出现了关系不唯一 —— 请给 user_roles 指名外键").not.toContain("PGRST201");
    expect(status, body).toBe(200);
  });

  it("按角色筛选的那种写法（!inner）也能跑通", async () => {
    // 与 listProfiles 在 filters.role 存在时构造的写法一致
    const withFilter = PROFILE_COLUMNS.replace(
      "user_roles!user_roles_profile_id_fkey(",
      "user_roles!user_roles_profile_id_fkey!inner(",
    );
    const select = encodeURIComponent(withFilter);
    const { status, body } = await restGet(
      `profiles?select=${select}&user_roles.role=eq.student&limit=1`,
    );

    expect(body).not.toContain("PGRST201");
    expect(status, body).toBe(200);
  });

  /**
   * ⚠️ 反向确认：**不指名外键**的写法**必须**仍然报 PGRST201。
   * 如果这条开始通过，说明这个文件已经抓不到它要抓的东西了 ——
   * 那时要修的是这个测试，而不是庆幸。
   */
  it("反向确认：不指名外键的旧写法**仍然**报错（否则这个测试就失效了）", async () => {
    const { status, body } = await restGet(
      `profiles?select=${encodeURIComponent("id, user_roles(role)")}&limit=1`,
    );

    expect(body, "旧写法不再报错？那说明这个测试已经不再验证任何东西").toContain("PGRST201");
    expect(status).toBe(300);
  });
});
