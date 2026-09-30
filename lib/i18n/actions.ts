"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from "./config";

/**
 * 切换语言。
 *
 * ⚠️ 本文件有 `"use server"`，因此**只能导出异步函数** ——
 * 常量（cookie 名、可选语言）一律放在 `./config`。
 * 本项目因为这条规则构建失败过 3 次。
 */
export async function setLocaleAction(locale: string): Promise<void> {
  /*
   * ⚠️ 来自表单/客户端，属于**不可信输入**。
   * 一个任意字符串被写进 cookie，就会在每次渲染时进 `getLocale()` ——
   * 因此这里必须校验，不能直接存。
   */
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    // 语言偏好不是敏感信息，但也没必要让 JS 读它
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // 语言变了，当前页面的服务端内容要重渲染
  revalidatePath("/", "layout");
}
