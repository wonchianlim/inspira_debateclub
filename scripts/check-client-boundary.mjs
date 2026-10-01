#!/usr/bin/env node
/**
 * 验证"调用客户端 Hook 的文件都带 `"use client"`"。
 *
 * 为什么要检查这个：
 *   2026-10-01 真的发生过一次 —— `components/layout/auth-brand-panel.tsx`
 *   调用了 `useMessages()`（客户端上下文）却没有 `"use client"`。
 *   后果是**登录页在服务端渲染时直接抛错**，而：
 *     * `npm run test` **全绿**（jsdom 里没有服务端/客户端边界，组件照常渲染）；
 *     * `npm run build` **当时也全绿**（那时认证页还在读语言 cookie、属于动态渲染，
 *       Next 不会在构建时预渲染它）。
 *   后来语言固定成英文、不再读 cookie，页面变成可静态预渲染，构建才把它抓出来。
 *
 *   也就是说：这类缺陷**只有构建或真实请求看得见**，测试看不见 ——
 *   所以它值得一个静态检查，而不是靠人记得。
 *
 * 做法：扫描 app/ 与 components/ 下的 .tsx，找出**调用了客户端 Hook**
 *   （`useMessages` / `useLocale` / `useState` / `useEffect` / `useRef` /
 *   `useActionState` / `useRouter` / `usePathname` / `useFormStatus`）
 *   却没有在文件顶部声明 `"use client"` 的文件。
 *
 * ⚠️ 反向确认（本项目踩过"检查静默通过"的坑）：
 *   脚本同时统计**确实带 `"use client"` 的文件数**，如果那是 0，
 *   说明扫描逻辑或路径错了（这个仓库不可能一个客户端组件都没有），
 *   于是判定为失败而不是通过。
 *
 * 用法：npm run check:client-boundary
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const projectRoot = process.cwd();
const SCAN_DIRS = ["app", "components"];

/** 只检查这些 Hook —— 它们都必须在客户端组件里调用。 */
const CLIENT_HOOKS = [
  "useState",
  "useEffect",
  "useRef",
  "useCallback",
  "useMemo",
  "useActionState",
  "useFormStatus",
  "useRouter",
  "usePathname",
  "useSearchParams",
  "useMessages",
  "useLocale",
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** 文件顶部（授权指令必须在最前）是否声明了 "use client"。 */
function hasUseClientDirective(source) {
  const head = source.slice(0, 400);
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(head);
}

/** 是否调用了客户端 Hook（按标识符边界匹配，避免 useMessagesX 这类误判）。 */
function calledHooks(source) {
  return CLIENT_HOOKS.filter((hook) => new RegExp(`\\b${hook}\\s*\\(`).test(source));
}

const files = SCAN_DIRS.flatMap((dir) => walk(resolve(projectRoot, dir)));
const problems = [];
let clientFileCount = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const declared = hasUseClientDirective(source);
  if (declared) {
    clientFileCount += 1;
    continue;
  }
  const hooks = calledHooks(source);
  if (hooks.length > 0) {
    problems.push({ file: relative(projectRoot, file), hooks });
  }
}

if (clientFileCount === 0) {
  console.error(
    '✖ 反向确认失败：一个带 "use client" 的文件都没扫到 —— 说明扫描路径或判断逻辑坏了，不是代码没问题。',
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(
    `✖ 有 ${problems.length} 个文件调用了客户端 Hook 却没有 "use client"：这类缺陷测试看不见，只会在构建或真实请求时炸。`,
  );
  for (const problem of problems) {
    console.error(`  ${problem.file}  →  ${problem.hooks.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `✓ 客户端边界正常：${files.length} 个 .tsx 中 ${clientFileCount} 个声明了 "use client"，` +
    `其余没有调用客户端 Hook。`,
);
