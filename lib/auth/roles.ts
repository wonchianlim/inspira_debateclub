/**
 * 角色定义、显示名与落地页。
 *
 * 这里**不**导入 `server-only`：角色与文案在客户端组件里也要用
 * （例如导航要根据角色显示哪些入口）。真正的权限判断在
 * `lib/auth/session.ts`（服务端）与数据库 RLS 两层，客户端只负责展示。
 */

/** 与数据库枚举 public.app_role 保持一致（第 2.11 节）。 */
export const APP_ROLES = ["student", "judge", "coach", "club_manager", "super_admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  student: "学生",
  judge: "裁判",
  coach: "教练",
  club_manager: "俱乐部管理员",
  super_admin: "超级管理员",
};

/**
 * 每个角色的落地页（规范第 8 节的路由清单）。
 *
 * 一个账号可能有多个角色，因此需要用**优先级**决定 /dashboard 往哪里跳。
 * 优先级从"权限最大"到"权限最小"，理由：拥有管理职责的人登录后
 * 最可能要先处理管理事务。
 */
export const ROLE_PRECEDENCE: AppRole[] = [
  "super_admin",
  "club_manager",
  "coach",
  "judge",
  "student",
];

/** 角色对应的区域入口。 */
export const ROLE_LANDING: Record<AppRole, string> = {
  student: "/student",
  judge: "/judge",
  coach: "/coach",
  club_manager: "/manage",
  super_admin: "/admin",
};

/** 每个区域允许哪些角色进入（与第 4 节权限矩阵一致）。 */
export const AREA_ROLES: Record<string, AppRole[]> = {
  student: ["student"],
  judge: ["judge"],
  coach: ["coach"],
  // 超级管理员按第 4 节矩阵同样可以执行俱乐部管理操作
  manage: ["club_manager", "super_admin"],
  admin: ["super_admin"],
};

/** 按优先级选出"身份最高的角色"，用于决定 /dashboard 的落地页。 */
export function primaryRole(roles: readonly AppRole[]): AppRole | null {
  for (const role of ROLE_PRECEDENCE) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export type RoleNavItem = { href: string; label: string };

/**
 * 按角色生成导航项。
 *
 * 说明：隐藏导航项只是**改善体验**，不是安全措施——
 * 直接输入地址仍然要到服务端的区域布局去校验（见 app/(app)/ 下各区域的 layout.tsx）。
 */
export function navForRoles(roles: readonly AppRole[]): RoleNavItem[] {
  // 概览、活动、通知是所有已登录用户都有的入口
  const items: RoleNavItem[] = [
    { href: "/dashboard", label: "概览" },
    { href: "/events", label: "活动" },
    { href: "/notifications", label: "通知" },
  ];

  if (roles.includes("student")) items.push({ href: "/student", label: "学生" });
  if (roles.includes("judge")) items.push({ href: "/judge", label: "裁判" });
  if (roles.includes("coach")) items.push({ href: "/coach", label: "教练" });
  if (roles.includes("club_manager") || roles.includes("super_admin")) {
    items.push({ href: "/manage", label: "俱乐部管理" });
  }
  if (roles.includes("super_admin")) items.push({ href: "/admin", label: "系统管理" });

  return items;
}
