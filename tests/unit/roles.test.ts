// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  APP_ROLES,
  AREA_ROLES,
  ROLE_LABELS,
  ROLE_LANDING,
  ROLE_PRECEDENCE,
  navForRoles,
  primaryRole,
} from "@/lib/auth/roles";

/**
 * 角色映射的纯逻辑测试。
 *
 * 端到端的访问控制（用真实会话访问各区域、断言 307/403/200）已用脚本实测通过；
 * 这里守住的是**映射表本身**——它容易在改导航或加入新角色时被改错，
 * 而那种错误不会让测试变红，只会让某类用户看到错误的入口。
 */
describe("角色映射", () => {
  it("每个角色都有中文名、落地页，且都在优先级列表里", () => {
    for (const role of APP_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_LANDING[role]).toMatch(/^\//);
      expect(ROLE_PRECEDENCE).toContain(role);
    }
  });

  it("优先级列表覆盖全部角色且无重复", () => {
    expect([...ROLE_PRECEDENCE].sort()).toEqual([...APP_ROLES].sort());
    expect(new Set(ROLE_PRECEDENCE).size).toBe(ROLE_PRECEDENCE.length);
  });

  it("落地页与区域访问权限一致（不能跳到进不去的区域）", () => {
    for (const role of APP_ROLES) {
      const area = ROLE_LANDING[role].slice(1); // 去掉开头的 /
      expect(
        AREA_ROLES[area],
        `角色 ${role} 的落地页 ${ROLE_LANDING[role]} 没有对应的访问规则`,
      ).toBeDefined();
      expect(AREA_ROLES[area]).toContain(role);
    }
  });

  it("按权限从大到小选出主要身份", () => {
    expect(primaryRole(["student"])).toBe("student");
    expect(primaryRole(["student", "judge"])).toBe("judge");
    expect(primaryRole(["coach", "club_manager"])).toBe("club_manager");
    expect(primaryRole(["club_manager", "super_admin"])).toBe("super_admin");
    expect(primaryRole([])).toBeNull();
  });

  it("超级管理员可以进入俱乐部管理区域（第 4 节矩阵）", () => {
    expect(AREA_ROLES.manage).toContain("super_admin");
  });

  it("不存在可以被学生或裁判进入的管理区域", () => {
    for (const area of ["manage", "admin"]) {
      expect(AREA_ROLES[area]).not.toContain("student");
      expect(AREA_ROLES[area]).not.toContain("judge");
      expect(AREA_ROLES[area]).not.toContain("coach");
    }
  });
});

describe("按角色生成导航", () => {
  it("始终包含概览、活动与通知入口（这三个所有已登录用户都有）", () => {
    expect(navForRoles([])).toEqual([
      { href: "/dashboard", label: "概览" },
      { href: "/events", label: "活动" },
      { href: "/notifications", label: "通知" },
    ]);
  });

  it("学生看到公共入口加学生区域", () => {
    const hrefs = navForRoles(["student"]).map((item) => item.href);
    expect(hrefs).toEqual(["/dashboard", "/events", "/notifications", "/student"]);
  });

  it("每个角色的导航项都与其可访问区域一致", () => {
    for (const role of APP_ROLES) {
      const publicHrefs = ["/dashboard", "/events", "/notifications"];
      const items = navForRoles([role]).filter((item) => !publicHrefs.includes(item.href));
      for (const item of items) {
        const area = item.href.slice(1);
        expect(
          AREA_ROLES[area],
          `${role} 的导航包含 ${item.href}，但没有对应的访问规则`,
        ).toBeDefined();
        expect(AREA_ROLES[area]).toContain(role);
      }
    }
  });

  it("超级管理员看到最完整的导航", () => {
    const hrefs = navForRoles(["super_admin"]).map((item) => item.href);
    expect(hrefs).toEqual(["/dashboard", "/events", "/notifications", "/manage", "/admin"]);
  });

  it("多角色时合并各自的入口，不重复", () => {
    const hrefs = navForRoles(["student", "judge", "coach"]).map((item) => item.href);
    expect(hrefs).toEqual([
      "/dashboard",
      "/events",
      "/notifications",
      "/student",
      "/judge",
      "/coach",
    ]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
