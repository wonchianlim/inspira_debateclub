import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env/client";

import type { Database } from "./database.types";

/**
 * 浏览器端 Supabase 客户端。
 *
 * ⚠️ 本模块**可以**被打包进浏览器代码，因此它只能读取 `NEXT_PUBLIC_` 前缀的公开变量
 * （见 `lib/env/client.ts`）。绝不要把 service-role key 或任何密钥放进来。
 *
 * 默认不建议使用：按 docs/architecture.md 第 7 节，业务读写应走服务端
 * （`lib/supabase/server.ts`），这样 RLS 以用户身份生效，且认证调用不必直连
 * Supabase 域名（对大陆访问更友好，见 ADR-0007）。
 *
 * 保留这个模块的用途是将来需要**实时订阅**（Realtime）等必须由浏览器直连的能力。
 * 在真正需要之前，不要为了方便在客户端直接查询业务数据。
 */
export function createBrowserSupabaseClient() {
  const env = clientEnv();

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
