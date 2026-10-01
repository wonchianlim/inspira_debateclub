import { DEFAULT_LOCALE, HTML_LANG, type Locale } from "./config";
import { en, type Messages } from "./messages/en";

export { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_LABELS, HTML_LANG } from "./config";
export type { Locale } from "./config";
export type { Messages } from "./messages/en";

/**
 * ⚠️ 2026-10-01 产品负责人决定：**界面只保留英文**（"there are none chinese speakers"）。
 *
 * 因此这里**不再读语言 cookie、也不再按语言取字典** —— 语言固定为英文，
 * 结果是确定的：不管浏览器里以前存过什么 cookie，页面都是英文。
 *
 * ⚠️ `messages/zh.ts` **保留在仓库里不用**（选项 A 的原话是"留着，将来要中文只是补文案"）。
 * 将来真要中文时，要改回来的是这一个文件：把 `zh` 重新接上、把切换器加回去，
 * 而不是重新设计一套取文案的机制。
 */
/** 当前语言。按产品决定固定为英文。 */
export function getLocale(): Locale {
  return DEFAULT_LOCALE;
}

/** 取当前语言的文案表。按产品决定固定为英文。 */
export async function getMessages(): Promise<Messages> {
  return en;
}

/** `<html lang>`。按产品决定固定为英文。 */
export async function getHtmlLang(): Promise<string> {
  return HTML_LANG[DEFAULT_LOCALE];
}
