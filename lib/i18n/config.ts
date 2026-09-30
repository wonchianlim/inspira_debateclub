/**
 * 多语言的配置常量。
 *
 * ⚠️ 常量放这里，**不放在 actions.ts** —— `"use server"` 文件只能导出
 * 异步函数，导出常量会导致构建失败（本项目的这个坑已经踩过 3 次）。
 */

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

/** 默认英文（产品负责人 2026-10-01 决定）。 */
export const DEFAULT_LOCALE: Locale = "en";

/** 语言偏好存在这个 cookie 里。 */
export const LOCALE_COOKIE = "inspira_locale";

/** 一年。语言偏好不需要频繁变动。 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

/** 该语言在 <html lang> 上应该写什么（影响屏幕阅读器发音）。 */
export const HTML_LANG: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
