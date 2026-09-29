import { z } from "zod";

/**
 * 认证相关的输入校验（主规格第 7 节："所有表单/动作/路由输入都用 Zod 校验"）。
 *
 * 集中放在这里的好处：服务端与客户端可以共用同一份规则，避免两边不一致
 * （例如客户端允许 6 位密码、服务端要求 8 位）。
 */

/** 邮箱：统一转小写并去掉首尾空格，避免出现"看起来一样但其实是两个账号"。 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "请输入有效的邮箱地址" }));

/**
 * 密码策略：V1 只要求长度。
 *
 * 刻意**不**要求大小写、数字、符号的组合：这类规则会促使用户使用
 * "Password1!" 这种可预测的密码，实际安全性不如长度。
 * （这是当前主流安全建议，且主规格未规定更强的复杂度要求。）
 */
const password = z
  .string()
  .min(8, { error: "密码至少 8 位" })
  .max(72, { error: "密码不能超过 72 位" });

const personName = z.string().trim().min(1, { error: "请填写" }).max(50, { error: "最多 50 字" });

/** 注册时允许选择的身份。其他角色由管理员授予，不能自助选择。 */
export const SIGNUP_ROLES = ["student", "judge"] as const;

export const signUpSchema = z.object({
  firstName: personName,
  lastName: personName,
  email,
  password,
  role: z.enum(SIGNUP_ROLES, { error: "请选择身份" }),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "请输入密码" }),
});

export const requestPasswordResetSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
