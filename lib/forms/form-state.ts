/**
 * 表单状态的通用形状。
 *
 * ⚠️ 必须放在**没有** `"use server"` 的文件里：Next.js 规定
 *    `"use server"` 文件只能导出异步函数，导出一个对象会导致构建失败
 *    （Phase 1 的 P1-9 已经踩过一次，详见 lib/auth/form-state.ts 的说明）。
 *
 * 形状是为 `useActionState` 设计的：表单可以显示行内错误并保留已填内容。
 */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const INITIAL_FORM_STATE: FormState = { status: "idle" };
