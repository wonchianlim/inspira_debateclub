/**
 * 认证表单的状态形状。
 *
 * 实现已移到 `lib/forms/form-state.ts`（通用形状），这里只保留认证专用的名字，
 * 避免改动已有的导入。两者是同一个类型，不是两套。
 */

export type { FormState as AuthFormState } from "@/lib/forms/form-state";
export { INITIAL_FORM_STATE as INITIAL_AUTH_STATE } from "@/lib/forms/form-state";
