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

/**
 * 保存评分表时的表单状态：比通用 `FormState` 多两个字段。
 *
 * ⚠️ 放在这里而不是 `lib/judge/ballot-actions.ts` —— 那个文件有 `"use server"`，
 * 只能导出**异步函数**（本项目已经在这条规则上踩过三次）。
 */
export type BallotDraftState = FormState & {
  /** 保存成功后服务端给出的新版本（`ballots.updated_at`） */
  version?: string;
  /**
   * 版本冲突：服务端上的这一份在我读它之后被别人改过。
   * 界面必须**停止**自动保存，而不是继续覆盖（规范 §9.3）。
   */
  conflict?: boolean;
};
