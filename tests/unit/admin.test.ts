// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PROFILE_STATUSES,
  PROFILE_STATUS_LABELS,
  profileIdSchema,
  setUserRolesSchema,
  updateProfileStatusSchema,
} from "@/lib/validation/admin";
import { APP_ROLES } from "@/lib/auth/roles";

const VALID_UUID = "aaaaaaaa-0000-0000-0000-000000000004";

describe("账号状态的输入校验", () => {
  it("三种状态都有中文名称", () => {
    for (const status of PROFILE_STATUSES) {
      expect(PROFILE_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("接受合法的状态变更", () => {
    for (const status of PROFILE_STATUSES) {
      const result = updateProfileStatusSchema.safeParse({ profileId: VALID_UUID, status });
      expect(result.success, `状态 ${status} 应当被接受`).toBe(true);
    }
  });

  it("拒绝无法识别的状态", () => {
    for (const bad of ["", "deleted", "ACTIVE", "admin", "0"]) {
      expect(
        updateProfileStatusSchema.safeParse({ profileId: VALID_UUID, status: bad }).success,
      ).toBe(false);
    }
  });

  it("拒绝格式不正确的用户标识", () => {
    expect(profileIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(profileIdSchema.safeParse("").success).toBe(false);
    expect(profileIdSchema.safeParse(123).success).toBe(false);
  });
});

describe("角色的输入校验", () => {
  it("接受全部合法角色", () => {
    const result = setUserRolesSchema.safeParse({ profileId: VALID_UUID, roles: [...APP_ROLES] });
    expect(result.success).toBe(true);
  });

  it("接受空数组（表示撤销全部角色）", () => {
    const result = setUserRolesSchema.safeParse({ profileId: VALID_UUID, roles: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roles).toEqual([]);
  });

  it("拒绝无法识别的角色", () => {
    const result = setUserRolesSchema.safeParse({
      profileId: VALID_UUID,
      roles: ["student", "owner"],
    });
    expect(result.success).toBe(false);
  });

  it("拒绝把角色当字符串传入（必须是数组）", () => {
    expect(setUserRolesSchema.safeParse({ profileId: VALID_UUID, roles: "student" }).success).toBe(
      false,
    );
  });
});

/**
 * 动作层保护措施的**源码级**测试。
 *
 * 为什么用读源码而不是直接调用：这些动作依赖 `next/cache`、`next/headers` 与
 * 数据库连接，在单元测试环境里无法执行。真正端到端的验证靠 `npm run db:verify`
 * （数据库策略）与手工访问页面。
 *
 * 这里守住的是"保护代码还在"。它们很容易在重构时被顺手删掉，
 * 而删掉之后所有测试仍然全绿 —— 因为没有任何测试会去调用它们。
 */
describe("系统管理动作的保护措施", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/admin/actions.ts"), "utf8");

  it("是 server action 文件", () => {
    expect(source.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("两个动作都检查了超级管理员身份", () => {
    // 两次独立的检查各出现一次：一个动作一次
    const matches = source.match(/session\.roles\.includes\("super_admin"\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("禁止修改自己的账号状态（避免自我锁死）", () => {
    expect(source).toContain("profileId === session.profileId");
  });

  it("撤销超级管理员之前会先统计剩余数量", () => {
    expect(source).toContain("countSuperAdmins");
    // 必须在删除之前判断
    const guardIndex = source.indexOf("countSuperAdmins");
    const deleteIndex = source.indexOf(".delete()");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(deleteIndex);
  });

  it("没有任何物理删除用户的代码", () => {
    // 只允许删除 user_roles 里的行；绝不允许删除 profiles 行
    expect(source).not.toMatch(/from\("profiles"\)\s*\.delete\(/);
  });

  it("读取用户数据的模块带 server-only 保护", () => {
    const users = readFileSync(resolve(process.cwd(), "lib/admin/users.ts"), "utf8");
    expect(users).toContain('import "server-only"');
  });
});

describe("列表查询的转义（防止通配符把结果放大）", () => {
  const users = readFileSync(resolve(process.cwd(), "lib/admin/users.ts"), "utf8");

  it("对 LIKE 通配符做了转义", () => {
    expect(users).toContain("escapeLikePattern");
    // 必须覆盖 % 与 _ 这两个通配符
    expect(users).toMatch(/\[\\\\%_\]/);
  });

  it("列表有行数上限，避免无上限页面", () => {
    expect(users).toContain("LIST_LIMIT");
    expect(users).toContain(".limit(LIST_LIMIT)");
  });
});
