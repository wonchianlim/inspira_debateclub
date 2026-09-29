#!/usr/bin/env node
/**
 * 验证 service-role 模块的"客户端误用即构建失败"防护确实有效。
 *
 * 背景（docs/architecture.md 第 7.3 节、主规格第 7 节）：
 * `lib/supabase/admin.ts` 首行的 `import "server-only"` 应当让**客户端组件**
 * 一旦引用它就**构建失败**。这是防止 service-role 密钥泄漏到浏览器的最后一道防线。
 *
 * 但"设置了防护"和"防护真的生效"是两件事。本项目已经多次出现"以为做了、
 * 实际没做"的情况（例如备案偏好策略的注释声称校验了合格性，但并没有）。
 * 因此这里用一个**真实的故意误用**去验证它会失败。
 *
 * 做法：临时写入一个 `"use client"` 组件并 import admin 模块 → 运行 next build →
 * 断言构建**失败** → 无论结果如何都删除探针文件。
 *
 * ⚠️ 探针目录名**不能**以 `_` 开头。Next.js 会把 `app/_xxx` 视为私有目录、
 *    排除在任何路由之外——那样文件根本不会被编译，构建自然成功，
 *    于是测试会误报"防护失效"。这个坑已经真实踩过一次，因此特别注明。
 *
 * 退出码：0 = 防护有效；1 = 防护失效（构建竟然成功了）或出现意外错误。
 *
 * 注意：本脚本会跑一次完整构建（约 10–30 秒），因此**不**放进 `npm run check`，
 * 而是单独用 `npm run check:server-only` 运行（CI 中应包含它）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const projectRoot = process.cwd();
const probeDir = join(projectRoot, "app", "server-only-guard-probe");
const probeFile = join(probeDir, "page.tsx");

const PROBE_SOURCE = `"use client";

// 故意误用：客户端组件不得引用带 service-role 的模块。
// 期望结果：next build 失败。
import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";

export default function ProbePage() {
  return <p>{typeof createServiceRoleSupabaseClient}</p>;
}
`;

let buildFailed = false;
let buildOutput = "";

try {
  rmSync(probeDir, { recursive: true, force: true });
  mkdirSync(dirname(probeFile), { recursive: true });
  writeFileSync(probeFile, PROBE_SOURCE, "utf8");

  try {
    buildOutput = execFileSync("npx", ["next", "build"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5 * 60 * 1000,
    });
  } catch (error) {
    // 构建失败是**期望**结果
    buildFailed = true;
    buildOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
} finally {
  rmSync(probeDir, { recursive: true, force: true });
}

if (existsSync(probeDir)) {
  console.error("✗ 无法清理探针目录，请手工删除 app/server-only-guard-probe/");
  process.exit(1);
}

/*
 * 恢复干净的构建状态。
 *
 * 为什么必须做：探针构建会往 `.next/types/validator.ts` 写入一条指向探针路由的
 * 类型引用。探针被删除后这条引用变成悬空，`tsc --noEmit` 会因此报错——
 * 实测确实发生过：TS2307 Cannot find module
 * '../../app/server-only-guard-probe/page.js'。
 *
 * 因此先删掉 `.next`，再完整重新构建一次，保证脚本跑完后仓库处于可用状态，
 * 不给后续的 typecheck 留下垃圾。
 */
rmSync(join(projectRoot, ".next"), { recursive: true, force: true });

try {
  execFileSync("npx", ["next", "build"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5 * 60 * 1000,
  });
} catch (error) {
  console.error(
    [
      "⚠️ 探针已清理，但恢复构建失败。请手工运行 `npm run build` 确认状态。",
      "",
      `${error.stdout ?? ""}${error.stderr ?? ""}`.split("\n").slice(-20).join("\n"),
    ].join("\n"),
  );
  process.exit(1);
}

if (!buildFailed) {
  console.error(
    [
      "✗ service-role 防护失效：客户端组件引用了 lib/supabase/admin.ts，但构建**成功**了。",
      "",
      "这意味着 service-role 密钥有被泄漏到浏览器的风险。",
      "请检查：",
      '  1. lib/supabase/admin.ts 首行是否仍有 import "server-only"；',
      "  2. server-only 包是否仍在依赖中。",
    ].join("\n"),
  );
  process.exit(1);
}

// 进一步确认失败原因确实是 server-only，而不是别的编译错误
const mentionsServerOnly = /server-only|Server-only|server only/i.test(buildOutput);

if (!mentionsServerOnly) {
  console.error(
    [
      "⚠️ 构建确实失败了，但输出中**没有**出现 server-only 相关字样。",
      "这说明失败可能另有原因（例如语法错误），防护未必真的生效。",
      "",
      "构建输出（末尾 40 行）：",
      buildOutput.split("\n").slice(-40).join("\n"),
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  "✓ service-role 防护有效：客户端组件引用 lib/supabase/admin.ts 会导致构建失败（server-only 生效）。",
);
