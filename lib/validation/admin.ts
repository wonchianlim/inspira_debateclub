import { z } from "zod";

import { APP_ROLES } from "@/lib/auth/roles";

/**
 * 系统管理相关的输入校验（主规格第 7 节：所有入口都用 Zod 校验）。
 *
 * ⚠️ 这里的校验只是**第一道**（挡住格式错误的输入、给出中文提示）。
 *    真正决定"这个人能不能做这件事"的是数据库 RLS 与服务端授权检查，
 *    前端校验永远不算安全措施。
 */

/** 账号状态，与数据库枚举 `profile_status` 一致。 */
export const PROFILE_STATUSES = ["active", "inactive", "suspended"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  active: "正常",
  inactive: "已停用",
  suspended: "已暂停",
};

export const PROFILE_STATUS_DESCRIPTIONS: Record<ProfileStatus, string> = {
  active: "可以正常登录和使用系统。",
  inactive: "不能登录。用于毕业、退社等已结束的情况。",
  suspended: "不能登录。用于违规等需要暂时或永久停止使用的情况。",
};

/**
 * ⚠️ 这里用 `z.guid()` 而**不是** `z.uuid()`。
 *
 * `z.uuid()` 会额外校验 RFC 4122 的**版本号**（第三段的第一个十六进制位）。
 * 我们的测试固定标识（`aaaaaaaa-0000-...`）版本位是 0，因此会被 `z.uuid()` 拒绝，
 * 而 PostgreSQL 完全接受它 —— 结果是"合法的标识被判为非法"。
 *
 * 这里真正想表达的是"形状像不像 UUID"，不是"是不是合规的 v4 UUID"，
 * 所以用只校验 8-4-4-4-12 十六进制格式的 `z.guid()`。
 */
export const profileIdSchema = z.guid({ error: "用户标识格式不正确" });

export const updateProfileStatusSchema = z.object({
  profileId: profileIdSchema,
  status: z.enum(PROFILE_STATUSES, { error: "请选择有效的账号状态" }),
});

export const setUserRolesSchema = z.object({
  profileId: profileIdSchema,
  // 允许为空数组：即撤销该账号的全部角色
  roles: z.array(z.enum(APP_ROLES, { error: "包含无法识别的角色" })).max(APP_ROLES.length),
});

export type UpdateProfileStatusInput = z.infer<typeof updateProfileStatusSchema>;
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;
