#!/usr/bin/env node
/**
 * 构建后检查：生产页面不得依赖未经大陆测试的境外资源。
 *
 * 依据 INSPIRA_DEEPSEEK_MASTER_SPEC.md 第 5.4 节：
 * "生产浏览器体验不得要求运行时访问 Google Fonts、公共 CDN、第三方 JS/字体/图片…"
 *
 * 用法：先 `npm run build`，再 `npm run check:no-third-party`
 *
 * 检查两件事：
 *   1. 构建产物中不得出现 Google Fonts 域名（字形文件是明确信号）；
 *   2. **服务端渲染出的 HTML** 中不得出现任何外部 http(s) 地址
 *      （因为这才是浏览器真正收到并会去请求的内容）。
 *
 * 刻意不扫描 .next 下的所有 JS：依赖包里的许可证注释含有 github.com 等
 * 无害链接，全量扫描会产生大量误报。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const projectRoot = process.cwd();
const nextDir = resolve(projectRoot, ".next");

const FORBIDDEN_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "google-analytics.com",
  "googletagmanager.com",
];

function walk(dir, filter = () => true) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

if (!statSync(nextDir, { throwIfNoEntry: false })) {
  console.error("✗ 找不到 .next 目录：请先运行 `npm run build`。");
  process.exit(1);
}

const failures = [];

// 检查 1：任何构建产物都不得引用 Google Fonts 等禁用的域名
const bannedPattern = new RegExp(FORBIDDEN_HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|"));
for (const file of walk(nextDir, (f) => /\.(js|css|html|json)$/.test(f))) {
  const content = readFileSync(file, "utf8");
  const hit = content.match(bannedPattern);
  if (hit) failures.push(`禁用的第三方域名 "${hit[0]}" 出现在 ${relative(projectRoot, file)}`);
}

/**
 * 这些不是网络地址，而是**命名空间标识符**（XML/SVG 规范规定的字符串）。
 * 浏览器只会把它们当作文档内部的标识来比较，永远不会去请求。
 * 因此必须排除，否则内联 SVG 会产生误报。
 */
const NAMESPACE_URIS = [
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/XML/1998/namespace",
  "http://www.w3.org/1999/XSL/Transform",
];

function isNonFetchable(url) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return true;
  return NAMESPACE_URIS.some((ns) => url.startsWith(ns));
}

// 检查 2：SSR 产出的 HTML 中不得有任何会被浏览器请求的外部地址
const htmlFiles = walk(nextDir, (f) => f.endsWith(".html"));
if (htmlFiles.length === 0) failures.push("没有找到任何 SSR HTML 文件，无法验证");

for (const file of htmlFiles) {
  const content = readFileSync(file, "utf8");
  const urls = content.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  const external = urls.filter((u) => !isNonFetchable(u));
  if (external.length > 0) {
    const unique = [...new Set(external)].slice(0, 5);
    failures.push(`${relative(projectRoot, file)} 含外部地址：${unique.join(", ")}`);
  }
}

if (failures.length > 0) {
  console.error("✗ 第三方资源检查未通过：\n");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.log(
  `✓ 第三方资源检查通过：扫描了构建产物，SSR HTML（${htmlFiles.length} 个）中无任何外部地址，也未出现 Google Fonts 等禁用域名。`,
);
