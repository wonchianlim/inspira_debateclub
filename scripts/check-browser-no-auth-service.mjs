#!/usr/bin/env node
/**
 * 验证"浏览器从不直接与认证服务通信"（ADR-0007）。
 *
 * 为什么要检查这个：
 *   主规格第 5.2 节要求浏览器尽量只访问自有域名；第 5.4 节要求生产页面不得依赖
 *   未经大陆测试的境外域名。认证是**每个用户每次使用都要走**的路径，因此一旦
 *   浏览器直连 <项目>.supabase.co，登录就会成为一个跨境依赖。
 *
 * 做法：先构建，然后扫描**浏览器端产物**（.next/static），确认其中不含任何
 *   直接调用认证服务的代码；同时**反向确认**服务端产物中确实存在这些调用。
 *
 * 为什么必须做反向确认：如果只检查"前端里没有 X"，那么一旦 grep 模式写错、
 *   或者产物路径变了，检查会**静默通过**——看起来是绿的，实际什么都没验证。
 *   这是本项目已经踩过的坑（详见 docs/testing.md）。因此这里要求：
 *     前端：0 处
 *     后端：> 0 处
 *   两者同时成立才算通过。
 *
 * 用法：npm run check:browser-no-supabase（需要先构建；脚本会自己构建）
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const projectRoot = process.cwd();
const buildDir = resolve(projectRoot, ".next");
const browserDir = join(buildDir, "static");
const serverDir = join(buildDir, "server");

/** 只可能出现在服务端的认证调用标识。 */
/**
 * 只可能出现在服务端的认证调用标识。
 *
 * ⚠️ 刻意**不**把裸的 `signUp` 放进列表：实测发现它会误报。
 *    Next.js 会把 Server Action 的**导出名**写进客户端产物（供 findSourceMapURL
 *    等工具使用），因此前端 chunk 里会出现 `"signUpAction"` —— 那是我们自己的
 *    动作名，与 Supabase 无关。
 *    宁可少一个标记，也不要留一个会误报的标记：误报会让人开始忽略检查结果。
 */
const AUTH_MARKERS = ["signInWithPassword", "resetPasswordForEmail", "verifyOtp", "signInWithOtp"];

/** 认证服务的路径前缀，出现在任何前端产物里都说明浏览器会直连它。 */
const AUTH_SERVICE_MARKERS = ["/auth/v1"];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|css|html|json)$/.test(full)) out.push(full);
  }
  return out;
}

function countFilesContaining(dir, needle) {
  const hits = [];
  for (const file of walk(dir)) {
    if (readFileSync(file, "utf8").includes(needle)) hits.push(relative(projectRoot, file));
  }
  return hits;
}

// 确保有产物可比对
if (!existsSync(buildDir)) {
  console.log("未找到 .next，先执行一次构建…");
  execFileSync("npx", ["next", "build"], { cwd: projectRoot, stdio: "inherit" });
}

const failures = [];

// ---- 检查 1：前端产物中不得出现任何认证调用或认证服务路径 ----
const browserMarkers = [...AUTH_MARKERS, ...AUTH_SERVICE_MARKERS];
const browserServerTotal = {};

for (const marker of browserMarkers) {
  const hits = countFilesContaining(browserDir, marker);
  browserServerTotal[marker] = hits;
  if (hits.length > 0) {
    failures.push(`浏览器端产物中出现「${marker}」：\n      ${hits.slice(0, 3).join("\n      ")}`);
  }
}

// ---- 检查 2（反向确认）：服务端产物中必须确实存在这些调用 ----
const controlMarkers = ["signInWithPassword", "verifyOtp"];
const controlResults = {};
for (const marker of controlMarkers) {
  controlResults[marker] = countFilesContaining(serverDir, marker).length;
}

if (controlResults.signInWithPassword === 0 || controlResults.verifyOtp === 0) {
  failures.push(
    [
      "反向确认失败：服务端产物中**找不到**认证调用。",
      `  signInWithPassword 命中文件数: ${controlResults.signInWithPassword}`,
      `  verifyOtp 命中文件数: ${controlResults.verifyOtp}`,
      "这说明本次检查的比对方式无效（可能产物路径变了、或 grep 模式过时），",
      "因此「前端里没有」这一结论不可信，不能算通过。",
    ].join("\n"),
  );
}

if (failures.length > 0) {
  console.error("✗ 浏览器直连认证服务的检查未通过：\n");
  for (const failure of failures) console.error("  - " + failure + "\n");
  process.exit(1);
}

console.log(
  [
    "✓ 认证调用只发生在服务端（ADR-0007 已验证）：",
    `    浏览器端产物：${browserMarkers.length} 个比对项，命中 0 个`,
    `    服务端产物（反向确认）：signInWithPassword 命中 ${controlResults.signInWithPassword} 个文件，` +
      `verifyOtp 命中 ${controlResults.verifyOtp} 个文件`,
  ].join("\n"),
);
