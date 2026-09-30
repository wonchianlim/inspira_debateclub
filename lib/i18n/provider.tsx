"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_LOCALE, type Locale } from "./config";
import { en, type Messages } from "./messages/en";

/**
 * 语言上下文。
 *
 * ⚠️ 为什么需要它：服务端组件可以直接读 cookie，但**客户端组件不行** ——
 * 而 `app/error.tsx` 这类错误边界**必须是客户端组件**，它也要显示文案。
 *
 * 做法：服务端的根布局读出语言与文案，通过本 Provider 传下去；
 * 客户端组件用 `useMessages()` 取。
 *
 * ⚠️ 本文件**不能** import `./index` —— 那个模块依赖 `next/headers`，
 * 一旦被客户端组件引用，构建会直接失败（"used in the Pages Router"）。
 * 这里只依赖 `./config` 与纯文案模块。
 */
const I18nContext = createContext<{ locale: Locale; messages: Messages }>({
  locale: DEFAULT_LOCALE,
  messages: en,
});

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}

/** 取当前语言的文案。客户端组件用这个。 */
export function useMessages(): Messages {
  return useContext(I18nContext).messages;
}

/** 取当前语言代码。 */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
