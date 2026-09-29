/**
 * 认证表单的状态形状与初始值。
 *
 * 为什么单独一个文件：`lib/auth/actions.ts` 顶部有 `"use server"`，
 * 而 Next.js 规定 **`"use server"` 文件只能导出异步函数**。
 * 把 `INITIAL_AUTH_STATE`（一个对象）放在那里会导致构建失败：
 *
 *   Error: A "use server" file can only export async functions, found object.
 *
 * 实测确实如此：一开始只被客户端组件引用时构建正常，直到服务端布局也
 * 导入了同一个模块里的动作，构建才报错。因此这里单独拆出来。
 */

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const INITIAL_AUTH_STATE: AuthFormState = { status: "idle" };
