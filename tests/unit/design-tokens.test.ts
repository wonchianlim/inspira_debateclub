// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 设计令牌的**自动化约束**（UI/UX 规范 §5）。
 *
 * ⚠️ 这个文件存在的理由：品牌色的对比度问题**是我手工测出来的**，
 * 而手工测的东西不会在下次改色时自动重测。
 *
 * 规范 §5.2 原文要求 "automated contrast verification" —— 这里就是它。
 *
 * 它防的是这样一类改动：有人觉得橙色按钮好看，把它设成主按钮背景，
 * 而白字在橙上只有 2.96:1 —— **那样按钮上的字会读不清，而且没人会发现。**
 */

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** 从 :root 里取一个令牌的值。 */
function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`找不到令牌 --${name}`);
  return match[1].trim();
}

/** 解析 #rrggbb 或 var(--x) 链。 */
function resolveHex(value: string, depth = 0): string {
  if (depth > 8) throw new Error(`令牌引用过深：${value}`);
  const ref = /var\(--([a-z0-9-]+)\)/i.exec(value);
  if (ref?.[1]) return resolveHex(token(ref[1]), depth + 1);
  const hex = /#([0-9a-f]{6})/i.exec(value);
  if (!hex?.[1]) throw new Error(`不是可解析的颜色：${value}`);
  return `#${hex[1].toLowerCase()}`;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}

describe("品牌色必须来自规范，不能是随手写的近似值", () => {
  it("Navy 与 Orange 就是规范给的那两个十六进制值", () => {
    expect(resolveHex(token("brand-navy-950"))).toBe("#071b45");
    expect(resolveHex(token("brand-orange-500"))).toBe("#fe643d");
  });

  it("焦点环是蓝色，不是品牌橙（规范要求，且橙会与『选中』混淆）", () => {
    expect(resolveHex(token("focus-ring"))).toBe("#2e6bd1");
    expect(resolveHex(token("ring"))).toBe("#2e6bd1");
  });
});

describe("对比度——规范 §5.2 要求的自动验证", () => {
  it("正文在页面上达到 WCAG AA（≥ 4.5:1）", () => {
    const bg = resolveHex(token("background"));
    for (const name of ["foreground", "text", "text-muted-token"]) {
      const ratio = contrast(resolveHex(token(name)), bg);
      expect(ratio, `${name} 在 background 上只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("主按钮的白字达到 AA", () => {
    const ratio = contrast(resolveHex(token("primary-foreground")), resolveHex(token("primary")));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * ⚠️ 这条**刻意断言橙色不达标**。
   *
   * 它不是在"测一个 bug"，而是在**锁住一个设计约束**：
   * 规范 §5.2 说橙色不能承载小字正文。
   * 如果哪天有人给橙色配了白字并当成合格，这条会失败，
   * 逼他去看规范 —— 而不是让按钮上的字悄悄读不清。
   */
  it("橙色**不能**承载白字正文 —— 这是规范明确记录的约束", () => {
    const ratio = contrast("#ffffff", resolveHex(token("brand-orange-500")));
    expect(
      ratio,
      "如果这条失败了，说明橙色变了，请重新对照规范 §5.2 确认它现在能否承载白字",
    ).toBeLessThan(4.5);
  });
});

describe("shadcn 令牌必须由规范令牌派生，而不是各自写死", () => {
  it("background / primary / ring 都是 var() 引用", () => {
    for (const name of ["background", "foreground", "primary", "ring", "card"]) {
      expect(token(name), `--${name} 应当引用第一层令牌`).toMatch(/var\(--/);
    }
  });

  it("改品牌色只需改第一层：background 指向 canvas", () => {
    expect(token("background")).toContain("--canvas");
    expect(resolveHex(token("background"))).toBe(resolveHex(token("canvas")));
  });
});

describe("字号阶梯（规范 §5.3）", () => {
  it("每一档都同时给出字号与行高", () => {
    for (const size of ["display", "h1", "h2", "h3", "title", "label", "caption"]) {
      expect(css, `缺少 --text-${size}`).toContain(`--text-${size}:`);
      expect(css, `--text-${size} 缺少行高`).toContain(`--text-${size}--line-height:`);
    }
  });
});
