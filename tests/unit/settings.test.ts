// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_SCHEDULE_OFFSETS } from "@/lib/domain/event-schedule";
import { scheduleSettingsSchema } from "@/lib/validation/settings";

/**
 * 系统设置（时间偏移量）的校验与动作保护。
 *
 * 重点：这组数值会决定"新建活动"时自动填出来的时间。
 * 如果允许"报名开放晚于报名截止"，那么新建活动的默认值就会违反数据库约束，
 * 错误会出现在**新建活动**页面上，而不是出现在设置页 —— 极难排查。
 * 因此必须在设置的入口就拦住。
 */

const VALID = {
  registrationOpensDaysBefore: "7",
  registrationClosesDaysBefore: "1",
  checkInOpensMinutesBefore: "30",
  warningMinutesBefore: "10",
};

describe("合法输入", () => {
  it("内置默认值能通过校验（默认值本身必须是合法的）", () => {
    const result = scheduleSettingsSchema.safeParse({
      registrationOpensDaysBefore: String(DEFAULT_SCHEDULE_OFFSETS.registrationOpensDaysBefore),
      registrationClosesDaysBefore: String(DEFAULT_SCHEDULE_OFFSETS.registrationClosesDaysBefore),
      checkInOpensMinutesBefore: String(DEFAULT_SCHEDULE_OFFSETS.checkInOpensMinutesBefore),
      warningMinutesBefore: String(DEFAULT_SCHEDULE_OFFSETS.warningMinutesBefore),
    });
    expect(result.success).toBe(true);
  });

  it("表单传来的是字符串（HTML 输入都是字符串），因此需要转换", () => {
    const result = scheduleSettingsSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.registrationOpensDaysBefore).toBe(7);
      expect(typeof result.data.registrationOpensDaysBefore).toBe("number");
    }
  });

  it("允许 0（例如活动开始当天仍可报名）", () => {
    const result = scheduleSettingsSchema.safeParse({
      ...VALID,
      registrationClosesDaysBefore: "0",
    });
    expect(result.success).toBe(true);
  });
});

describe("非法输入", () => {
  it("报名开放必须早于截止（否则新建活动的默认时间会违反数据库约束）", () => {
    const inverted = scheduleSettingsSchema.safeParse({
      ...VALID,
      registrationOpensDaysBefore: "1",
      registrationClosesDaysBefore: "7",
    });
    expect(inverted.success).toBe(false);

    const equal = scheduleSettingsSchema.safeParse({
      ...VALID,
      registrationOpensDaysBefore: "3",
      registrationClosesDaysBefore: "3",
    });
    expect(equal.success).toBe(false);
  });

  it("拒绝负数", () => {
    expect(
      scheduleSettingsSchema.safeParse({ ...VALID, checkInOpensMinutesBefore: "-5" }).success,
    ).toBe(false);
  });

  it("拒绝小数", () => {
    expect(
      scheduleSettingsSchema.safeParse({ ...VALID, warningMinutesBefore: "1.5" }).success,
    ).toBe(false);
  });

  it("拒绝非数字", () => {
    expect(
      scheduleSettingsSchema.safeParse({ ...VALID, registrationOpensDaysBefore: "七天" }).success,
    ).toBe(false);
    expect(
      scheduleSettingsSchema.safeParse({ ...VALID, registrationOpensDaysBefore: "" }).success,
    ).toBe(false);
  });

  it("拒绝过大的值（防止把设置写成天文数字）", () => {
    expect(
      scheduleSettingsSchema.safeParse({ ...VALID, registrationOpensDaysBefore: "9999" }).success,
    ).toBe(false);
    expect(
      scheduleSettingsSchema.safeParse({ ...VALID, checkInOpensMinutesBefore: "99999" }).success,
    ).toBe(false);
  });
});

describe("动作层保护", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/admin/settings-actions.ts"), "utf8");

  it("是 server action 文件", () => {
    expect(source.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("检查了超级管理员身份（数据库策略也要求超管）", () => {
    expect(source).toContain('session.roles.includes("super_admin")');
  });

  it("写入了 updated_by（该列非空，漏了会直接插入失败）", () => {
    expect(source).toContain("updated_by: session.profileId");
  });
});
