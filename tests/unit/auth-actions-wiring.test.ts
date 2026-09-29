// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 守住"登录与找回密码确实经过限流"这条链路。
 *
 * 分工说明：
 *   - `scripts/db-tests.sql` 验证**限流机制本身**正确（窗口、计数、隔离）；
 *   - 本文件验证**动作确实调用了它**，并且是在调用认证服务**之前**。
 *
 * 为什么需要后者：如果只测机制，那么有一天有人把限流调用删掉、或挪到
 * `signInWithPassword` 之后，机制测试仍然全绿，而实际已经失去保护。
 * 顺序尤其重要——放在认证调用之后等于没有限流。
 *
 * 这里直接读源码而不是 import：这些模块依赖 `server-only` 与 `next/headers`，
 * 在测试环境里无法直接执行。
 */

const source = readFileSync(resolve(process.cwd(), "lib/auth/actions.ts"), "utf8");

/** 取出某个导出函数的主体（到下一个 export async function 为止）。 */
function bodyOf(actionName: string): string {
  const start = source.indexOf(`export async function ${actionName}(`);
  if (start === -1) throw new Error(`未找到动作：${actionName}`);

  const next = source.indexOf("export async function", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("认证动作的限流接线", () => {
  it("登录：在调用认证服务之前先限流", () => {
    const body = bodyOf("signInAction");

    const ipCheck = body.indexOf("enforceIpRateLimit");
    const emailCheck = body.indexOf("consumeRateLimit");
    const authCall = body.indexOf("signInWithPassword");

    expect(ipCheck).toBeGreaterThan(-1);
    expect(emailCheck).toBeGreaterThan(-1);
    expect(authCall).toBeGreaterThan(-1);

    // 顺序是关键：限流必须在认证调用**之前**
    expect(ipCheck).toBeLessThan(authCall);
    expect(emailCheck).toBeLessThan(authCall);
  });

  it("登录：同时按 IP 与邮箱两个维度限流", () => {
    const body = bodyOf("signInAction");

    expect(body).toContain("enforceIpRateLimit");
    expect(body).toMatch(/consumeRateLimit\([^)]*`email:/);
  });

  it("找回密码：在发送邮件之前先限流", () => {
    const body = bodyOf("requestPasswordResetAction");

    const ipCheck = body.indexOf("enforceIpRateLimit");
    const emailCheck = body.indexOf("consumeRateLimit");
    const authCall = body.indexOf("resetPasswordForEmail");

    expect(ipCheck).toBeGreaterThan(-1);
    expect(emailCheck).toBeGreaterThan(-1);
    expect(authCall).toBeGreaterThan(-1);

    expect(ipCheck).toBeLessThan(authCall);
    expect(emailCheck).toBeLessThan(authCall);
  });

  it("超限时返回统一的提示，且不泄漏账号是否存在", () => {
    for (const action of ["signInAction", "requestPasswordResetAction"]) {
      const body = bodyOf(action);
      expect(body).toContain("TOO_MANY_ATTEMPTS");
      expect(body).toContain("if (!ipLimit.allowed || !emailLimit)");
    }
  });

  it("限流模块本身带 server-only 保护（不得被打进浏览器）", () => {
    const rateLimit = readFileSync(resolve(process.cwd(), "lib/auth/rate-limit.ts"), "utf8");
    expect(rateLimit).toContain('import "server-only"');
  });
});
