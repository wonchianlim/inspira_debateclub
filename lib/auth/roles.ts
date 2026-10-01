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
/**
 * 工作区（UI/UX 规范 §3、§4.6）。
 *
 * ⚠️ 规范 §0.1 对旧界面的第一条批评就是：
 *   "A shallow header with Overview, Events, Notifications, Club Management,
 *    and System Management **shown together**."
 *
 * 也就是说：把四种角色的入口平铺在同一个页头里，**用户分不清自己此刻是"谁"**。
 * 一个既是裁判又是管理员的人，看到的是两套混在一起的入口。
 *
 * 现在按**工作区**分组：
 *   - 每个工作区有自己的名字、落地页与自己的导航项
 *   - 页头只显示**当前所在工作区**的导航
 *   - 有多个工作区时，用切换器跳转（规范 §3 要求）
 */
export type Workspace = {
  key: string;
  /** 切换器上显示的工作区名。 */
  label: string;
  href: string;
  /** 命中的路径前缀，用来判断"当前在哪个工作区"。顺序即优先级。 */
  match: string[];
  items: RoleNavItem[];
};

/**
 * 按角色列出可用的工作区。
 *
 * ⚠️ 这里只影响**导航显示**，不是授权。真正的权限在服务端各区域的 layout 与 RLS 里 ——
 * 隐藏入口从来不是安全措施。
 */
export function workspacesForRoles(
  roles: readonly AppRole[],
  labels: {
    overview: string;
    events: string;
    notifications: string;
    student: string;
    judge: string;
    coach: string;
    clubManagement: string;
    admin: string;
  },
): Workspace[] {
  /* 概览、活动、通知是所有已登录用户共有的 —— 归入「概览」工作区。 */
  const shared: RoleNavItem[] = [
    { href: "/dashboard", label: labels.overview },
    { href: "/events", label: labels.events },
    { href: "/notifications", label: labels.notifications },
  ];

  const list: Workspace[] = [
    {
      key: "overview",
      label: labels.overview,
      href: "/dashboard",
      match: ["/dashboard", "/events", "/notifications"],
      items: shared,
    },
  ];

  if (roles.includes("student")) {
    list.push({
      key: "student",
      label: labels.student,
      href: "/student",
      match: ["/student"],
      items: [...shared, { href: "/student", label: labels.student }],
    });
  }
  if (roles.includes("judge")) {
    list.push({
      key: "judge",
      label: labels.judge,
      href: "/judge",
      match: ["/judge"],
      items: [...shared, { href: "/judge", label: labels.judge }],
    });
  }
  if (roles.includes("coach")) {
    list.push({
      key: "coach",
      label: labels.coach,
      href: "/coach",
      match: ["/coach"],
      items: [...shared, { href: "/coach", label: labels.coach }],
    });
  }
  if (roles.includes("club_manager") || roles.includes("super_admin")) {
    list.push({
      key: "manage",
      label: labels.clubManagement,
      href: "/manage",
      match: ["/manage"],
      items: [...shared, { href: "/manage", label: labels.clubManagement }],
    });
  }
  if (roles.includes("super_admin")) {
    list.push({
      key: "admin",
      label: labels.admin,
      href: "/admin",
      match: ["/admin"],
      items: [...shared, { href: "/admin", label: labels.admin }],
    });
  }

  return list;
}

/** 根据当前路径判断在哪个工作区。匹配不到就回到第一个（概览）。 */
export function activeWorkspace(workspaces: readonly Workspace[], pathname: string): Workspace {
  const bySpecificity = [...workspaces].sort(
    (a, b) => longestMatch(b, pathname) - longestMatch(a, pathname),
  );
  const hit = bySpecificity.find((w) => longestMatch(w, pathname) > 0);
  return hit ?? (workspaces[0] as Workspace);
}

function longestMatch(workspace: Workspace, pathname: string): number {
  return workspace.match.reduce(
    (best, prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`)
        ? Math.max(best, prefix.length)
        : best,
    0,
  );
}
