import "server-only";

import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";

import type { Database } from "./database.types";

/**
 * service-role（万能钥匙）客户端。
 *
 * ⚠️⚠️ 这是全项目**权限最高、也最危险**的一个模块。它**绕过 RLS**。
 *
 * 第一道防线是文件首行的 `import "server-only"`：
 * 只要有人在**客户端组件**里 import 了本模块，`next build` 会**直接失败**，
 * 而不是等到上线后才发现密钥泄漏到浏览器。这道防线由
 * `npm run check:server-only` 自动验证（它会故意制造一次误用并断言构建失败）。
 *
 * 允许使用的场景只有三种（docs/architecture.md 第 7.3 节）：
 *   1. 投递邮件 —— 定时任务没有登录用户；
 *   2. 代建认证账号 —— 注册流程的初始授权；
 *   3. 系统级初始化 —— 种子数据、迁移后回填。
 *
 * **禁止**：为了"省事"绕过 RLS；在 Server Action 里用它代替权限检查。
 *   每一处调用都必须有注释说明"为什么不能用用户身份完成"。
 */
export function createServiceRoleSupabaseClient() {
  const env = serverEnv();

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // service-role 不是某个用户，因此不持久化会话、不自动刷新、不解析 URL 中的令牌。
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
