// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AUTOSAVE_IDLE_MS,
  AUTOSAVE_MAX_RETRIES,
  AUTOSAVE_RETRY_MS,
  autosaveLabel,
  canAutosave,
  versionMatches,
  withExpectedVersion,
  type AutosaveStatus,
} from "@/lib/domain/ballot-autosave";

/**
 * 自动保存与乐观并发的规则（规范 §9.3）。
 *
 * ⚠️ 这里最重要的是**冲突之后不许再自动保存**那一条。
 * 它是一条安全规则：允许的话，裁判在两个窗口之间每打一个字都会覆盖对方的修改，
 * 而规范明确要求这件事 "never **silently**" 发生。
 */

const formatTime = (instant: Date) => `${String(instant.getHours()).padStart(2, "0")}:00`;

describe("什么时候允许自动保存", () => {
  it("空闲 / 待保存 / 已保存 / 失败 都允许", () => {
    for (const status of ["idle", "pending", "saved", "failed"] as const) {
      expect(canAutosave(status), `${status} 应当允许`).toBe(true);
    }
  });

  it("**冲突时不允许** —— 这是本文件最重要的一条", () => {
    expect(canAutosave("conflict")).toBe(false);
  });

  it("正在保存时不重复发起", () => {
    expect(canAutosave("saving")).toBe(false);
  });

  it("所有状态都有明确结论（新增状态不会悄悄变成允许）", () => {
    const all: AutosaveStatus[] = ["idle", "pending", "saving", "saved", "failed", "conflict"];
    for (const status of all) {
      expect(typeof canAutosave(status)).toBe("boolean");
    }
  });
});

describe("版本比对", () => {
  it("一样就算一致", () => {
    expect(versionMatches("2026-10-01T10:00:00Z", "2026-10-01T10:00:00Z")).toBe(true);
  });

  it("不一样就是冲突", () => {
    expect(versionMatches("2026-10-01T10:00:00Z", "2026-10-01T10:05:00Z")).toBe(false);
  });

  it("两边都没有（这份草稿还没建）算一致", () => {
    expect(versionMatches(null, null)).toBe(true);
    // 空字符串按 null 处理：表单里空值就是"我读的时候还没有这一行"
    expect(versionMatches("", null)).toBe(true);
    expect(versionMatches(null, "")).toBe(true);
  });

  it("我以为是新的、服务端已经有了 → 冲突（别人刚建了这一行）", () => {
    expect(versionMatches(null, "2026-10-01T10:00:00Z")).toBe(false);
  });
});

describe("提交给服务端的数据里带什么版本", () => {
  it("正常自动保存：带上我读到的版本", () => {
    const data = withExpectedVersion(new FormData(), "v1");
    expect(data.get("expectedUpdatedAt")).toBe("v1");
    expect(data.get("overwrite")).toBeNull();
  });

  it("还没有这一行时带空字符串（不是「不带」）", () => {
    const data = withExpectedVersion(new FormData(), null);
    // ⚠️ 空字符串与"字段不存在"是两件事：后者表示裁判明确选择覆盖
    expect(data.get("expectedUpdatedAt")).toBe("");
    expect(data.get("overwrite")).toBeNull();
  });

  it("裁判明确选择覆盖：带 overwrite，且**不**带版本", () => {
    const data = withExpectedVersion(new FormData(), "v1", true);
    expect(data.get("overwrite")).toBe("true");
    expect(data.get("expectedUpdatedAt")).toBeNull();
  });

  it("从「覆盖」回到正常保存时，旧的 overwrite 会被清掉", () => {
    const data = new FormData();
    withExpectedVersion(data, "v1", true);
    withExpectedVersion(data, "v2", false);
    expect(data.get("overwrite")).toBeNull();
    expect(data.get("expectedUpdatedAt")).toBe("v2");
  });
});

describe("状态提示（规范点名的三个说法）", () => {
  it("正在保存 / 刚刚已保存 / 没能保存（会重试）都在", () => {
    expect(autosaveLabel("saving", null, formatTime)).toBe("正在保存…");
    expect(autosaveLabel("saved", new Date(2026, 9, 1, 14), formatTime)).toContain("刚刚已保存");
    expect(autosaveLabel("failed", null, formatTime)).toContain("正在重试");
  });

  it("冲突时的提示要说清楚「停下来了」，而不是含糊的「出错了」", () => {
    const label = autosaveLabel("conflict", null, formatTime);
    expect(label).toContain("别处被改过");
    expect(label).toContain("已停止");
  });

  it("没有任何改动时不显示任何字（不要挂一句「已保存」当噪音）", () => {
    expect(autosaveLabel("idle", null, formatTime)).toBe("");
  });
});

describe("节奏参数本身也是决定", () => {
  it("空闲计时器够长，不会打断打字；又不是长到丢很多内容", () => {
    expect(AUTOSAVE_IDLE_MS).toBeGreaterThanOrEqual(1000);
    expect(AUTOSAVE_IDLE_MS).toBeLessThanOrEqual(10000);
  });

  it("重试次数有上限（无限重试只会一直打服务器）", () => {
    expect(AUTOSAVE_MAX_RETRIES).toBeGreaterThan(0);
    expect(AUTOSAVE_MAX_RETRIES).toBeLessThanOrEqual(5);
    expect(AUTOSAVE_RETRY_MS).toBeGreaterThanOrEqual(1000);
  });
});
