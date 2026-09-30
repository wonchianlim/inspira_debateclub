import { cookies } from "next/headers";

import { DEFAULT_LOCALE, HTML_LANG, LOCALE_COOKIE, type Locale, isLocale } from "./config";
import { en, type Messages } from "./messages/en";
import { zh } from "./messages/zh";

export { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_LABELS, HTML_LANG } from "./config";
export type { Locale } from "./config";
export type { Messages } from "./messages/en";

const DICTIONARIES: Record<Locale, Messages> = { en, zh };

/**
 * 读取当前语言（服务端）。
 *
 * ⚠️ 用 cookie 而不是网址路径，因此**路由结构完全不动** ——
 * 38 个动态路由一个都不用挪。这是个登录后才用的内部系统，
 * 不需要按语言分网址。
 *
 * ⚠️ 在**服务端**读，所以第一次渲染就是正确的语言，不会先闪英文再变中文。
 * 那种闪烁是客户端方案绕不开的问题。
 *
 * cookie 缺失或值非法都回退到默认语言（英文），**不抛错** ——
 * 一个坏 cookie 不该让整个站点打不开。
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** 取当前语言的完整文案表。 */
export async function getMessages(): Promise<Messages> {
  return DICTIONARIES[await getLocale()];
}

/** 取当前语言在 `<html lang>` 上该写的值。 */
export async function getHtmlLang(): Promise<string> {
  return HTML_LANG[await getLocale()];
}
