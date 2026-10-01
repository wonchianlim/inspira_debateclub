// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AREA_ROLES,
  type AppRole,
  ROLE_LANDING,
  ROLE_LABELS,
  activeWorkspace,
  primaryRole,
  workspacesForRoles,
} from "@/lib/auth/roles";

/** 测试用的文案表 —— 只关心结构，不关心具体措辞。 */
const L = {
  overview: "Overview",
  events: "Events",
  notifications: "Notifications",
  student: "Student",
  judge: "Judge",
  coach: "Coach",
  clubManagement: "Club Management",
  admin: "Administration",
};

const ws = (roles: AppRole[]) => workspacesForRoles(roles, L);

describe("工作区分组（UI/UX 规范 §0.1、§4.6）", () => {
  /**
   * ⚠️ 这是规范对旧界面的**第一条**批评：
   *   "Overview, Events, Notifications, Club Management, and System Management
   *    shown together."
   *
   * 所以这条测试锁的是：**页头里不再同时出现全部角色的入口。**
   */
  it("页头不会同时给出俱乐部管理与系统管理的入口", () => {
    const list = ws(["club_manager", "super_admin"]);
    const manage = list.find((w) => w.key === "manage");
    const admin = list.find((w) => w.key === "admin");

    expect(manage, "应有俱乐部管理工作区").toBeDefined();
    expect(admin, "应有系统管理工作区（超管）").toBeDefined();

    // 关键：各自的 items 里【不】包含对方那一项
    expect(manage?.items.map((i) => i.href)).not.toContain("/admin");
    expect(admin?.items.map((i) => i.href)).not.toContain("/manage");
  });

  it("只用学生身份时，看不到任何管理入口", () => {
    const hrefs = ws(["student"]).flatMap((w) => w.items.map((i) => i.href));
    expect(hrefs).toContain("/student");
    expect(hrefs).not.toContain("/manage");
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/judge");
  });

  it("多重角色会得到多个工作区（切换器据此出现）", () => {
    expect(ws(["judge"]).length).toBe(2); // 概览 + 裁判
    expect(ws(["judge", "club_manager"]).length).toBe(3); // 概览 + 裁判 + 俱乐部管理
  });

  it("每个工作区都带名字与落地页（切换器要用）", () => {
    for (const w of ws(["student", "judge", "coach", "club_manager", "super_admin"])) {
      expect(w.label, `${w.key} 缺少名字`).toBeTruthy();
      expect(w.href.startsWith("/"), `${w.key} 的落地页不是路径`).toBe(true);
      expect(w.items.length, `${w.key} 没有任何导航项`).toBeGreaterThan(0);
    }
  });
});

describe("判断当前在哪个工作区", () => {
  const list = ws(["judge", "club_manager"]);

  it("按路径命中对应工作区", () => {
    expect(activeWorkspace(list, "/judge").key).toBe("judge");
    expect(activeWorkspace(list, "/manage/events/abc").key).toBe("manage");
    expect(activeWorkspace(list, "/notifications").key).toBe("overview");
  });

  /**
   * ⚠️ 边界：`/admin` 与 `/administration` 毫无关系，不能被前缀误命中。
   * 用 `startsWith(prefix)` 而不加分隔符判断，就会犯这个错。
   */
  it("前缀匹配必须按路径段，不能是纯字符串前缀", () => {
    expect(activeWorkspace(list, "/judges")).not.toBeUndefined();
    const hit = activeWorkspace(list, "/judges");
    expect(hit.key, "/judges 不应被当成 /judge").toBe("overview");
  });

  it("匹配不到任何工作区时回退到第一个", () => {
    expect(activeWorkspace(list, "/totally/unknown").key).toBe("overview");
  });

  it("更具体的路径优先", () => {
    // /admin 与 /manage 同时存在时，各自命中各自
    const multi = ws(["club_manager", "super_admin"]);
    expect(activeWorkspace(multi, "/admin/users").key).toBe("admin");
    expect(activeWorkspace(multi, "/manage/events").key).toBe("manage");
  });
});

describe("角色基础数据", () => {
  it("每个角色都有自己的落地页", () => {
    for (const role of Object.keys(ROLE_LABELS) as AppRole[]) {
      expect(ROLE_LANDING[role], `${role} 缺少落地页`).toBeTruthy();
    }
  });

  it("按权限优先级选出主角色", () => {
    expect(primaryRole(["student", "super_admin"])).toBe("super_admin");
    expect(primaryRole(["student"])).toBe("student");
    expect(primaryRole([])).toBeNull();
  });

  it("区域权限矩阵里，管理区接受俱乐部管理员与超管（规范 §4.4）", () => {
    expect(AREA_ROLES.manage).toContain("club_manager");
    expect(AREA_ROLES.manage).toContain("super_admin");
    expect(AREA_ROLES.admin).toEqual(["super_admin"]);
  });

  it("学生进不了管理区", () => {
    expect(AREA_ROLES.manage).not.toContain("student");
    expect(AREA_ROLES.admin).not.toContain("student");
  });
});
