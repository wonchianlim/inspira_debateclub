// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 回归防护：生产页面不得依赖未经大陆测试的境外资源。
 *
 * 依据 INSPIRA_DEEPSEEK_MASTER_SPEC.md 第 5.4 节与 AGENTS.md 的
 * "Do not add Google-hosted assets, public package CDNs, analytics, CAPTCHA,
 * or other browser dependencies without mainland-China testing and approval"。
 *
 * 背景：`shadcn init` 默认会注入 `next/font/google` 的 Geist 字体。P1-2 已移除，
 * 本测试确保它不会在后续步骤中被重新引入。
 *
 * 本测试只扫描**源代码目录**（app/、components/、lib/），不扫描 docs/，
 * 因为文档里需要举例说明这些域名。
 */

const projectRoot = process.cwd();

const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"];

/** 禁止在源代码中出现的导入/引用模式。 */
const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "next/font/google 字体加载器", pattern: /from\s*["']next\/font\/google["']/ },
  { label: "Google Fonts 域名", pattern: /fonts\.googleapis\.com/ },
  { label: "Google Fonts 静态域名", pattern: /fonts\.gstatic\.com/ },
  { label: "Google Analytics", pattern: /google-analytics\.com|googletagmanager\.com/ },
  { label: "jsDelivr CDN", pattern: /cdn\.jsdelivr\.net/ },
  { label: "unpkg CDN", pattern: /unpkg\.com/ },
  { label: "cdnjs CDN", pattern: /cdnjs\.cloudflare\.com/ },
  { label: "Google reCAPTCHA", pattern: /google\.com\/recaptcha|gstatic\.com\/recaptcha/ },
];

function collectSourceFiles(dir: string): string[] {
  const absolute = resolve(projectRoot, dir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = join(absolute, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(join(dir, entry)));
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

/**
 * 去掉注释后再匹配，避免"解释为什么不用它"的说明文字被误判为实际引用。
 * 只处理行注释与块注释两类，够用且不会误伤字符串字面量里的内容。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("不依赖境外浏览器资源", () => {
  const files = SOURCE_DIRS.flatMap(collectSourceFiles);

  it("扫描到了源代码文件（防止目录改名导致测试空转）", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("源代码中没有引入 Google 字体加载器", () => {
    const offenders = files.filter((file) =>
      /from\s*["']next\/font\/google["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => relative(projectRoot, f))).toEqual([]);
  });

  it.each(FORBIDDEN_PATTERNS)("源代码中没有 $label", ({ pattern }) => {
    const offenders = files
      .filter((file) => pattern.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => relative(projectRoot, file));
    expect(offenders).toEqual([]);
  });
});
