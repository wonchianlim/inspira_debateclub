import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 设计令牌的读取与对比度计算（**测试专用**，不是生产代码）。
 *
 * ⚠️ 抽出来的理由：对比度规则要同时被两处用到 ——
 *   1. `design-tokens.test.ts` —— 逐个令牌检查；
 *   2. `status-badge.test.tsx` —— 从**组件真实渲染出的 class**反查令牌，
 *      确认每个语气在自己底色上都能读清。
 *
 * 如果两处各写一份换算代码，其中一份被改坏时另一份仍然"通过"，
 * 于是我们得到一个看起来在守护对比度、实际早已失效的测试。
 */

export const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** 从 CSS 里取一个令牌的值（第一条匹配，即亮色主题那一份）。 */
export function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`找不到令牌 --${name}`);
  return match[1].trim();
}

/** 解析 #rrggbb 或 var(--x) 链。 */
export function resolveHex(value: string, depth = 0): string {
  if (depth > 8) throw new Error(`令牌引用过深：${value}`);
  const ref = /var\(--([a-z0-9-]+)\)/i.exec(value);
  if (ref?.[1]) return resolveHex(token(ref[1]), depth + 1);
  const hex = /#([0-9a-f]{6})/i.exec(value);
  if (!hex?.[1]) throw new Error(`不是可解析的颜色：${value}`);
  return `#${hex[1].toLowerCase()}`;
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}

/**
 * 把 Tailwind 的 `bg-x` / `text-x` 工具类换算成真实的十六进制颜色。
 *
 * Tailwind 的主题变量命名是机械的：`bg-info-bg` 用的是 `--color-info-bg`，
 * `text-muted-foreground` 用的是 `--color-muted-foreground`。
 * 因此可以从组件**真正渲染出来的 class** 反查颜色，
 * 而不是靠测试里再手抄一份"哪个语气配哪个颜色"—— 那种手抄件一旦与组件不同步，
 * 测试就会一边通过一边失去意义。
 */
export function classToHex(utility: string): string {
  const withoutPrefix = utility.replace(/^(?:bg|text|border)-/, "");
  return resolveHex(token(`color-${withoutPrefix}`));
}
