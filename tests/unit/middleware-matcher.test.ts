// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 中间件的 matcher 必须排除静态资源。
 *
 * 为什么值得单独测试：中间件会对每个匹配到的请求做一次**会话核实**
 * （`supabase.auth.getUser()` 会向认证服务发请求）。如果静态资源也被匹配，
 * 每个 `.js` / `.css` / 图片都会多一次跨境往返——在大陆网络下会明显拖慢首屏，
 * 而主规格第 14.5 节要求静态资源可正常加载。
 *
 * 这种回归很隐蔽：功能看起来完全正常，只是变慢。因此用测试锁住它。
 *
 * 实现说明：这里直接读取 `middleware.ts` 源码取出 matcher 字符串，
 * 而不是 import 该模块——import 会把 @supabase/ssr 与 next/server 一并拉进
 * 测试环境，代价大且与测试目标无关。
 */

const source = readFileSync(resolve(process.cwd(), "middleware.ts"), "utf8");

/** 从源码中取出 config.matcher 里的字符串字面量。 */
function extractMatcher(): string {
  // 注意：`matcher: [` 与字符串之间夹着一段注释块，因此必须用非贪婪的 [\s\S]*?
  // 跨过注释；用 \s* 会因为注释而匹配失败（这是本测试第一版的真实错误）。
  const match = source.match(/matcher:\s*\[[\s\S]*?"((?:[^"\\]|\\.)*)"/);
  if (!match?.[1]) {
    throw new Error(`未能从 middleware.ts 中解析出 matcher。源码开头：\n${source.slice(0, 300)}`);
  }
  // 还原 TS 字符串转义：源码里写的 `\\.` 在运行时的值是 `\.`
  return match[1].replace(/\\(.)/g, "$1");
}

const matcher = extractMatcher();
const pattern = new RegExp(`^${matcher}$`);

describe("middleware matcher", () => {
  it("能解析出 matcher 且它是一条正则", () => {
    expect(matcher.length).toBeGreaterThan(0);
    expect(matcher.startsWith("/")).toBe(true);
  });

  it.each(["/", "/dashboard", "/student/events", "/manage/events/abc", "/api/health"])(
    "页面与接口路径会经过中间件：%s",
    (path) => {
      expect(pattern.test(path)).toBe(true);
    },
  );

  it.each([
    "/_next/static/chunks/main.js",
    "/_next/static/css/app.css",
    "/_next/image",
    "/favicon.ico",
    "/logo.png",
    "/hero.jpg",
    "/icons/sprite.svg",
    "/fonts/brand.woff2",
  ])("静态资源不经过中间件：%s", (path) => {
    expect(pattern.test(path)).toBe(false);
  });

  it("中间件使用 getUser() 而不是 getSession() 做会话核实", () => {
    // getSession() 只解码 cookie，内容可被伪造，不能用于安全判断。
    expect(source).toContain("auth.getUser()");
    // 允许注释里提到 getSession 作对比，但不得出现在实际调用中
    expect(/await\s+supabase\.auth\.getSession\s*\(/.test(source)).toBe(false);
  });
});
