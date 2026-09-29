import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env/server";

import type { Database } from "./database.types";

/**
 * 以**当前登录用户**身份运行的 Supabase 客户端 —— 这是默认选择。
 *
 * 依据 docs/architecture.md 第 7 节：三种客户端里，这一种是**所有业务读写**的默认路径。
 *
 * 为什么它是安全的默认值：
 *   它带着当前用户的登录凭证发请求，因此数据库的 RLS 会自动按"这个用户"生效。
 *   不需要在每次查询里手写权限过滤——**正是这一点让"授权在数据库边界执行"
 *   （主规格第 7 节）真正落地**。
 *
 * ⚠️ 不要为了方便改用 service-role（`admin.ts`）来"跳过麻烦的权限"。
 *    那会让 RLS 形同虚设，并且违反主规格第 7 节"绝不作为绕过授权的捷径"。
 */
export async function createUserSupabaseClient() {
  const env = serverEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            /*
             * 在 **Server Component** 中调用 `cookies().set()` 会抛错，因为
             * Server Component 只负责渲染，不能修改响应头。
             *
             * 这不是 bug，而是预期行为，**可以安全忽略**：会话刷新由
             * `middleware.ts` 负责（它在响应头还能改动的阶段运行）。
             * 这也是 @supabase/ssr 官方推荐的写法。
             *
             * 本 catch 刻意保持为空并留下这段说明，以免后来者误以为错误被吞掉了。
             */
          }
        },
      },
    },
  );
}
