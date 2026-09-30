// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

/**
 * 邮件队列**真的能发出去**（Phase 9 的 "email job processing"）。
 *
 * ⚠️ 这个测试会**真的发一封邮件**（走 Resend）。因此：
 *   - 默认**跳过**，只有显式设了 `EMAIL_SEND_TEST=1` 才跑
 *   - 理由：CI 不该每次构建都往外发信，那既浪费额度也会污染送达率统计
 *
 * 跑法：`EMAIL_SEND_TEST=1 npx vitest run tests/integration/email-dispatch.test.ts`
 */

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const map: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && m[2] !== undefined) map[m[1]] = m[2];
    }
    return map;
  } catch {
    return {};
  }
}

const env = loadEnv();
const ENABLED = process.env.EMAIL_SEND_TEST === "1";
const TEST_RECIPIENT = "1013182970@qq.com";

let client: SupabaseClient<Database>;
let insertedId: string | null = null;

beforeAll(async () => {
  if (!ENABLED) return;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("需要 Supabase 本地环境变量");
  /*
   * ⚠️ vitest **不会**自动把 .env.local 注入 process.env，
   * 而服务角色客户端会自己读环境变量。
   *
   * ⚠️ 我在这上面连试了三次才做对：
   *   1. 只注入了 Resend 的键 → 失败（缺的是 Supabase 的）
   *   2. 补了一串键 → 还是失败（漏了 RATE_LIMIT_SALT）
   *   3. 仍然失败，因为**顶部 import 会被提升**，在 beforeAll 之前就执行了
   *      → 改成测试内动态导入
   *
   * 结论：**不要维护一份"我需要的键"清单**，直接把 .env.local 全量注入。
   * 清单会漏，而漏掉的那个变量总是在最难查的时候发作。
   */
  for (const [key, val] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = val;
  }
  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

afterAll(async () => {
  if (insertedId) await client.from("email_outbox").delete().eq("id", insertedId);
});

describe.skipIf(!ENABLED)("消费队列：从入队到真正发出", () => {
  it("入队一条 → 消费 → 状态变成 sent（并且真的发出去了）", async () => {
    const { data, error } = await client
      .from("email_outbox")
      .insert({
        to_email: TEST_RECIPIENT,
        template_key: "ballot_published",
        payload: {
          studentName: "端到端测试",
          eventTitle: "邮件队列验证",
          roundText: "测试轮",
        },
        status: "pending",
        scheduled_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .select("id")
      .single();

    expect(error, `入队失败：${error?.message}`).toBeNull();
    insertedId = data!.id as string;

    /*
     * ⚠️ **动态导入**，不能写在文件顶部。
     *
     * `dispatch` 会 import 服务角色客户端，而那个模块在**导入时**就校验环境变量。
     * 顶部的 import 会被提升到 `beforeAll` **之前**执行 —— 那时环境变量还没设，
     * 于是必然失败，而且错误信息（"环境变量配置不完整"）看不出是时序问题。
     * （第一次改的时候我就只补了变量、没意识到这一点，所以还是失败。）
     */
    const { dispatchEmailOutbox } = await import("@/lib/email/dispatch");
    const summary = await dispatchEmailOutbox();
    expect(summary.sent, `发送摘要：${JSON.stringify(summary)}`).toBeGreaterThanOrEqual(1);

    const { data: after } = await client
      .from("email_outbox")
      .select("status, sent_at, last_error, attempts")
      .eq("id", insertedId)
      .single();

    expect(after?.status, `last_error=${after?.last_error}`).toBe("sent");
    expect(after?.sent_at).not.toBeNull();
    expect(after?.last_error).toBeNull();
  }, 30_000);
});
