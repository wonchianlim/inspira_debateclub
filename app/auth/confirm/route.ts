import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createUserSupabaseClient } from "@/lib/supabase/server";

/**
 * 邮件链接的回跳路由 —— **运行在我们自己的域名上**。
 *
 * 为什么需要它（ADR-0007）：Supabase 默认把邮件链接指向认证服务域名
 * （本地实测为 127.0.0.1:54321，生产会是 <项目>.supabase.co）。那是一个
 * 未经大陆测试的境外域名，用户可能根本打不开这封邮件里的链接。
 * 自定义邮件模板改为指向 `{SiteURL}/auth/confirm?token_hash=...&type=...`，
 * 由本路由在自己的域名上完成校验并建立会话。
 *
 * 流程：邮件里的 token_hash → verifyOtp → 建立会话（写 cookie）→ 跳转到目标页。
 */

/** 不同用途的链接，校验成功后应去的默认位置。 */
const DEFAULT_DESTINATION: Record<string, string> = {
  // 重置密码：校验成功后还需要用户设置新密码，因此去设置页
  recovery: "/reset-password",
  // 邮箱确认、魔法链接、邀请：会话已建立，直接进仪表盘
  email: "/dashboard",
  signup: "/dashboard",
  email_change: "/dashboard",
  magiclink: "/dashboard",
  invite: "/dashboard",
};

/**
 * 只允许站内相对路径，防止开放重定向。
 *
 * 必须同时挡住：
 *   - `//evil.com`  —— 协议相对地址，浏览器会当成外部站点；
 *   - `/\evil.com`  —— 某些浏览器会把反斜杠当作斜杠。
 * 这类漏洞常被用于钓鱼：链接域名是我们的，跳转后却是攻击者的页面。
 */
function safeDestination(rawNext: string | null, fallback: string): string {
  if (!rawNext) return fallback;
  if (!rawNext.startsWith("/")) return fallback;
  if (rawNext.startsWith("//") || rawNext.startsWith("/\\")) return fallback;
  return rawNext;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fallback = DEFAULT_DESTINATION[type ?? ""] ?? "/dashboard";
  const destination = safeDestination(searchParams.get("next"), fallback);

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", origin));
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // 服务端留诊断信息；给用户的只是一个可理解的提示（不泄漏 token 细节）
    console.error("[auth] 邮件链接校验失败:", error.message);
    return NextResponse.redirect(new URL("/login?error=link-expired", origin));
  }

  return NextResponse.redirect(new URL(destination, origin));
}
