import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { serverEnv } from "@/lib/env/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";

/**
 * 应用层频率限制。
 *
 * 主规格第 7 节要求对"认证相邻"的接口限流。这里覆盖两个最值得保护的入口：
 *   - 登录：防止对某个账号或来源做密码暴力破解；
 *   - 找回密码：防止被当作"邮件轰炸"工具（也会连带触发认证服务自身的邮件上限）。
 *
 * 与认证服务自带限流的关系：
 *   Supabase Auth 本身已有限流（本地配置：sign_in_sign_ups = 30 次/5 分钟/IP，
 *   email_sent = 2 封/小时）。本模块是**更前面的一道**：在调用认证服务之前就挡住，
 *   避免把压力传递下去。两层并存，互不替代。
 *
 * 隐私：计数键是加盐 SHA-256 摘要，数据库里不保存明文 IP
 *   （见 supabase/migrations/20260929091400_rate_limiting.sql 的说明）。
 */

export type RateLimitRule = {
  /** 用途分类，不同用途各自计数 */
  bucket: string;
  /** 窗口内允许的次数 */
  max: number;
  /** 窗口长度（秒） */
  windowSeconds: number;
};

/**
 * 各入口的限额。
 *
 * 取值理由：正常用户几乎不可能在 5 分钟内登录失败 10 次；
 * 而找回密码一封就够，给 5 次/小时足以覆盖"没收到、再发一次"的正常情况。
 */
export const RATE_LIMITS = {
  signIn: { bucket: "auth.sign_in", max: 10, windowSeconds: 300 },
  passwordReset: { bucket: "auth.password_reset", max: 5, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

/** 对主体做加盐哈希，避免在数据库里保存可直接识别的信息。 */
function hashSubject(subject: string): string {
  const salt = serverEnv().RATE_LIMIT_SALT;
  return createHash("sha256").update(`${salt}:${subject}`).digest("hex");
}

/**
 * 取出来源 IP。
 *
 * ⚠️ 部署要求：生产环境必须运行在会设置 `x-forwarded-for`（或 `x-real-ip`）
 *    的反向代理之后。直连 `next start` 时该头部通常不存在。
 */
async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headerList.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

/**
 * 消耗一次配额。
 *
 * @returns true = 允许本次操作；false = 已超限，调用方应拒绝。
 */
export async function consumeRateLimit(rule: RateLimitRule, subject: string): Promise<boolean> {
  const admin = createServiceRoleSupabaseClient();

  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_bucket: rule.bucket,
    p_subject_hash: hashSubject(subject),
    p_max: rule.max,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    /*
     * 限流本身出错时**放行**并记录错误（fail-open）。
     *
     * 取舍说明：这是一个可用性与严格性的权衡。理由有两点：
     *   1. 数据库不可用时，登录本来也会失败，限流失效不会让情况更糟；
     *   2. 认证服务自身仍有一层限流，不会因为这里放行就完全失去保护。
     * 若将来引入更严格的要求，可改为 fail-closed，但必须同时准备好告警。
     */
    console.error("[rate-limit] 计数失败，本次放行:", error.message);
    return true;
  }

  return data === true;
}

/**
 * 按来源 IP 限流。
 *
 * 若取不到 IP（本地直连、代理未设置头部），则**跳过限流**并打印一次警告——
 * 在开发环境强行限流会让所有人都挤进同一个桶里，反而更难用。
 * 生产环境必须确保代理设置了相应头部（见上面的部署要求）。
 */
export async function enforceIpRateLimit(
  rule: RateLimitRule,
): Promise<{ allowed: boolean; skipped: boolean }> {
  const ip = await clientIp();

  if (!ip) {
    console.warn(
      `[rate-limit] 未取得来源 IP，跳过「${rule.bucket}」限流。` +
        "若这是生产环境，请确认反向代理设置了 x-forwarded-for。",
    );
    return { allowed: true, skipped: true };
  }

  return { allowed: await consumeRateLimit(rule, `ip:${ip}`), skipped: false };
}
