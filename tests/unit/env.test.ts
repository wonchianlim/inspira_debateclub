// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SERVER_ENV_KEYS, resetServerEnvCache, serverEnv } from "@/lib/env/server";

/**
 * 验证 P1-3 的核心承诺：必需的环境变量缺失时**启动即失败**，
 * 并且错误信息对非技术读者有用、同时**不泄漏任何值**。
 *
 * 依据规范第 5.3 节与第 7 节。
 */

const MANAGED_KEYS = [...SERVER_ENV_KEYS.required, ...SERVER_ENV_KEYS.optional];

const VALID_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role-value",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  // 频率限制用的盐：至少 32 位
  RATE_LIMIT_SALT: "0123456789abcdef0123456789abcdef",
};

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetServerEnvCache();
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetServerEnvCache();
});

describe("服务端环境变量校验", () => {
  it("全部必需变量齐全时校验通过并返回值", () => {
    Object.assign(process.env, VALID_ENV);

    const env = serverEnv();

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(VALID_ENV.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
  });

  it.each(SERVER_ENV_KEYS.required)("缺少 %s 时抛出错误并点名该变量", (missingKey) => {
    Object.assign(process.env, VALID_ENV);
    delete process.env[missingKey];

    expect(() => serverEnv()).toThrowError(new RegExp(missingKey));
  });

  it("错误信息不包含任何变量的值（防止密钥被写进日志）", () => {
    Object.assign(process.env, VALID_ENV);
    delete process.env.NEXT_PUBLIC_APP_URL;

    let message = "";
    try {
      serverEnv();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
    expect(message).not.toContain(VALID_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    // 但必须告诉使用者缺了什么
    expect(message).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("错误信息给出面向初学者的修复步骤", () => {
    Object.assign(process.env, VALID_ENV);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => serverEnv()).toThrowError(/\.env\.local/);
    expect(() => serverEnv()).toThrowError(/\.env\.example/);
  });

  it("空字符串等同于未提供（.env 里留空不会被当成有值）", () => {
    Object.assign(process.env, VALID_ENV);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "   ";

    expect(() => serverEnv()).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("可选变量可以完全缺失", () => {
    Object.assign(process.env, VALID_ENV);

    const env = serverEnv();

    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBeUndefined();
    expect(env.JOB_DISPATCH_SECRET).toBeUndefined();
  });

  it("可选变量一旦提供就必须满足最低要求", () => {
    Object.assign(process.env, VALID_ENV);
    process.env.JOB_DISPATCH_SECRET = "too-short";

    expect(() => serverEnv()).toThrowError(/JOB_DISPATCH_SECRET/);
  });

  it("网址格式不正确时报错", () => {
    Object.assign(process.env, VALID_ENV);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "不是网址";

    expect(() => serverEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("同一进程内只校验一次（结果被缓存）", () => {
    Object.assign(process.env, VALID_ENV);
    const first = serverEnv();

    // 即使之后变量被删掉，缓存的仍应可用（证明没有每次都重新解析）
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(serverEnv()).toBe(first);
  });
});

describe("环境变量声明与实际文件一致", () => {
  const examplePath = resolve(process.cwd(), ".env.example");

  /** 解析 .env.example 中的变量名（忽略注释与空行）。 */
  function declaredNames(): string[] {
    return readFileSync(examplePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => line.split("=")[0]?.trim() ?? "")
      .filter((name) => /^[A-Z0-9_]+$/.test(name));
  }

  it(".env.example 列出的变量与代码中声明的一致（防止文档漂移）", () => {
    expect(declaredNames().sort()).toEqual([...MANAGED_KEYS].sort());
  });

  it("没有任何密钥使用 NEXT_PUBLIC_ 前缀（该前缀会打进浏览器）", () => {
    const secretLike = /SERVICE_ROLE|SECRET|PASSWORD|PRIVATE/;
    const leaked = MANAGED_KEYS.filter(
      (key) => key.startsWith("NEXT_PUBLIC_") && secretLike.test(key),
    );

    expect(leaked).toEqual([]);
  });

  it("service-role 密钥不是公开变量", () => {
    expect(SERVER_ENV_KEYS.required).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect("SUPABASE_SERVICE_ROLE_KEY".startsWith("NEXT_PUBLIC_")).toBe(false);
  });
});
