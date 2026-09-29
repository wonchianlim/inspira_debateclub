"use server";

import { redirect } from "next/navigation";
import type { z } from "zod";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { RATE_LIMITS, consumeRateLimit, enforceIpRateLimit } from "@/lib/auth/rate-limit";
import {
  requestPasswordResetSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/validation/auth";

/**
 * 认证相关的 Server Actions。
 *
 * 为什么全部走 Server Action（ADR-0007）：
 *   浏览器只向**我们自己的域名**发请求，服务端再去和认证服务通信。
 *   这样做的直接好处是：即使认证服务从大陆访问不稳定，登录页本身仍能打开并
 *   给出可理解的提示；而且失败可以被我们自己的日志记录，而不是只能看浏览器控制台。
 *
 * 返回值的形状是为 `useActionState` 设计的：表单可以显示行内错误并保留已填内容
 * （主规格第 13 节要求）。
 */

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const INITIAL_AUTH_STATE: AuthFormState = { status: "idle" };

/** 把 Zod 的校验结果转成表单可用的字段错误。 */
function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

/**
 * 登录失败时统一返回这条消息。
 *
 * 安全要求（主规格第 7、8 节）：**不得**泄漏"这个邮箱是否存在"。
 * 因此"邮箱不存在"和"密码错误"返回完全相同的提示。
 */
const GENERIC_SIGN_IN_ERROR = "邮箱或密码不正确。";

/** 注册失败时的通用提示（同样不泄漏账号是否存在）。 */
const GENERIC_SIGN_UP_ERROR = "注册失败，请稍后再试或更换邮箱。";

/**
 * 触发频率限制时的提示。
 *
 * 刻意说明"稍后再试"，而不是"账号被锁定"：后者会让人以为账号出了问题，
 * 也可能被用来判断某个邮箱是否存在。
 */
const TOO_MANY_ATTEMPTS = "操作过于频繁，请稍后再试。";

// -----------------------------------------------------------------------------
// 注册
// -----------------------------------------------------------------------------
export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "请检查表单内容。",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const { firstName, lastName, email, password, role } = parsed.data;
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // 这些字段会被 handle_new_auth_user 触发器用来创建 profiles 行
      data: {
        first_name: firstName,
        last_name: lastName,
        display_name: `${lastName}${firstName}`,
      },
    },
  });

  if (error) {
    // 只记录服务端诊断信息，不回显给用户（可能含账号是否存在等线索）
    console.error("[auth] signUp 失败:", error.message);
    return { status: "error", message: GENERIC_SIGN_UP_ERROR };
  }

  if (!data.user) {
    return { status: "error", message: GENERIC_SIGN_UP_ERROR };
  }

  /*
   * 角色与身份档案的初始授予。
   *
   * 为什么这里必须用 service-role：新账号此刻**还没有任何角色**，而 RLS 默认拒绝，
   * 因此它无法自己写入 user_roles 或 student_profiles。这正是
   * docs/architecture.md 第 7.3 节列出的允许用途之一（系统级初始授权）。
   *
   * 默认角色按 PERM-D-1（已确认）：
   *   - 学生 → student_profiles + student 角色
   *   - 裁判 → judge_profiles（approval_status = pending）+ judge 角色
   *     ⚠️ 裁判必须由管理员批准后才可被指派（主规格第 3.2 节），
   *        因此这里只建档案、不批准。
   */
  const admin = createServiceRoleSupabaseClient();
  try {
    if (role === "judge") {
      const { error: judgeError } = await admin
        .from("judge_profiles")
        .insert({ profile_id: data.user.id });
      if (judgeError) throw judgeError;
    } else {
      const { error: studentError } = await admin
        .from("student_profiles")
        .insert({ profile_id: data.user.id });
      if (studentError) throw studentError;
    }

    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ profile_id: data.user.id, role });
    if (roleError) throw roleError;
  } catch (provisionError) {
    console.error("[auth] 初始角色授予失败:", provisionError);
    return {
      status: "error",
      message: "账号已创建，但初始化未完成。请联系管理员，我们会为你补上。",
    };
  }

  // 本地开发关闭了邮箱确认，注册后直接有会话；生产开启确认时则提示去收邮件。
  if (!data.session) {
    return {
      status: "success",
      message: "注册成功。请查看你的邮箱并点击确认链接后再登录。",
    };
  }

  redirect("/dashboard");
}

// -----------------------------------------------------------------------------
// 登录
// -----------------------------------------------------------------------------
export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "请检查表单内容。",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  /*
   * 限流：同时按来源 IP 与目标邮箱各计一次。
   *
   * 为什么两个维度都要：
   *   - 只按 IP：攻击者换 IP 就能继续猜某个账号的密码；
   *   - 只按邮箱：攻击者用一个 IP 遍历大量邮箱，就变成撞库。
   * 两者叠加才能同时挡住"盯住一个账号"与"广撒网"两类攻击。
   */
  const ipLimit = await enforceIpRateLimit(RATE_LIMITS.signIn);
  const emailLimit = await consumeRateLimit(RATE_LIMITS.signIn, `email:${parsed.data.email}`);
  if (!ipLimit.allowed || !emailLimit) {
    return { status: "error", message: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    console.error("[auth] 登录失败:", error.message);
    return { status: "error", message: GENERIC_SIGN_IN_ERROR };
  }

  redirect("/dashboard");
}

// -----------------------------------------------------------------------------
// 登出
// -----------------------------------------------------------------------------
export async function signOutAction(): Promise<void> {
  const supabase = await createUserSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// -----------------------------------------------------------------------------
// 请求密码重置邮件
// -----------------------------------------------------------------------------
export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = requestPasswordResetSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      status: "error",
      message: "请检查表单内容。",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  /*
   * 限流：这个入口最容易被滥用为"邮件轰炸"工具，因此必须在调用认证服务**之前**挡住。
   * 同时按来源 IP 与目标邮箱计数，避免有人反复给同一个人发信、
   * 也避免有人用一个 IP 给大量邮箱发信。
   */
  const ipLimit = await enforceIpRateLimit(RATE_LIMITS.passwordReset);
  const emailLimit = await consumeRateLimit(
    RATE_LIMITS.passwordReset,
    `email:${parsed.data.email}`,
  );
  if (!ipLimit.allowed || !emailLimit) {
    return { status: "error", message: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

  if (error) {
    // 仍然记录诊断信息，但**不**把错误回显给用户：否则可以据此枚举出哪些邮箱已注册。
    console.error("[auth] 发送重置邮件失败:", error.message);
  }

  // 无论邮箱是否存在，都返回同样的成功提示（主规格第 7 节：不泄漏记录是否存在）。
  return {
    status: "success",
    message: "如果这个邮箱已注册，你会收到一封重置密码的邮件。请同时检查垃圾邮件文件夹。",
  };
}

// -----------------------------------------------------------------------------
// 设置新密码（用户点击邮件里的链接、会话建立之后）
// -----------------------------------------------------------------------------
export async function updatePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "请检查表单内容。",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createUserSupabaseClient();

  // 先确认确实有会话。没有会话就更新密码，等于任何人都能改任意账号的密码。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "链接已失效或已过期。请重新申请一封重置邮件。",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    console.error("[auth] 更新密码失败:", error.message);
    return { status: "error", message: "设置新密码失败，请重新申请一封重置邮件。" };
  }

  redirect("/dashboard");
}
