import "server-only";

import { forbidden, redirect } from "next/navigation";

import type { AppRole } from "@/lib/auth/roles";
import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 服务端会话与授权。
 *
 * 这是**第二层**权限检查（第一层是数据库 RLS，见 docs/permissions.md 第 1 节）。
 * 两层都需要：
 *   - RLS 是最后防线，即使某个查询路径忘了检查也拦得住；
 *   - 服务端检查负责"这个动作该不该发生"，并能给出友好的中文提示。
 *
 * ⚠️ 这里读取角色用的是**用户身份**的客户端（受 RLS 限制），不是 service-role。
 *    这样"能读到哪些角色"本身就由数据库保证，而不是靠这段代码自觉。
 */

export type SessionContext = {
  profileId: string;
  email: string;
  displayName: string;
  roles: AppRole[];
};

/** 读取当前会话；未登录返回 null。 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createUserSupabaseClient();

  // 必须用 getUser()：它会向认证服务**核实**，而不是只解码 cookie
  // （cookie 内容可被伪造，不能用于安全判断）。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, email, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("profile_id", user.id),
  ]);

  // profiles 行由 handle_new_auth_user 触发器保证存在。
  // 若查不到，说明数据异常，按"未登录"处理更安全。
  if (!profile) return null;

  /*
   * 账号被停用或暂停时，一律视为**没有会话**。
   *
   * 为什么必须在这里判断：仅把数据库里的 status 改成 inactive 是**没有作用**的 ——
   * Supabase 的登录 cookie 仍然有效，被停用的人还能继续使用系统，直到 cookie 自然过期。
   * 那样"停用"就只是一个好看的状态标签，而不是真的挡住了人。
   *
   * 放在这里的好处是**所有**受保护路径都会经过它（区域布局 → requireSession），
   * 因此不需要在每个页面各写一次判断。
   */
  if (profile.status !== "active") return null;

  return {
    profileId: profile.id,
    email: profile.email,
    displayName: profile.display_name || profile.email,
    roles: (roleRows ?? []).map((row) => row.role as AppRole),
  };
}

/**
 * 要求已登录，否则跳转到登录页。
 *
 * 关于跳转而不是返回 401：主规格第 8 节允许"安全地 403 或跳转"。
 * 对"未登录"而言，跳到登录页对用户最有用（可以直接登录后继续）。
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

/**
 * 要求拥有指定角色之一，否则返回**真正的 403**。
 *
 * 为什么用 forbidden() 而不是跳到某个页面：它会返回 HTTP 403 状态码。
 * 若改成跳到 /forbidden 之类的页面，状态码会是 200——那样爬虫与监控
 * 都无法区分"页面不存在"和"没有权限"，也不利于排查。
 *
 * 注意这里只判断**页面级**权限。具体到某条记录是否可见，仍然由 RLS 决定，
 * 且调用方必须保证"记录不存在"与"无权访问"对用户表现一致（第 8 节要求）。
 */
export async function requireAnyRole(allowed: readonly AppRole[]): Promise<SessionContext> {
  const session = await requireSession();

  const permitted = allowed.some((role) => session.roles.includes(role));
  if (!permitted) forbidden();

  return session;
}
