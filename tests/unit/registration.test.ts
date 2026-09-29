// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EVENT_STATUSES, type EventStatus } from "@/lib/domain/event-lifecycle";
import {
  EVENT_STATUSES_BLOCKING_REGISTRATION,
  REGISTRATION_WINDOW_MESSAGES,
  type RegistrationWindowState,
  cancellationStatus,
  checkRegistration,
  isEventStatusOpenForRegistration,
  partitionFormatChoices,
  registrationWindowState,
  validatePreferenceRanks,
} from "@/lib/domain/registration";

/**
 * 学生报名的领域规则。
 *
 * 这些规则必须与数据库里的 `is_event_registration_open` 等函数**逐字一致**，
 * 因此测试的重点是：
 *   1. **边界时刻的方向**（恰好等于开放/截止的那一毫秒）；
 *   2. **穷举活动状态**（九个状态一个不漏）；
 *   3. 取消的两种状态如何由时间决定。
 */

const OPENS = new Date("2026-10-08T01:00:00.000Z");
const CLOSES = new Date("2026-10-14T15:00:00.000Z");

/** 与数据库一致：只有这四种状态不能报名。 */
const BLOCKING_STATUSES: EventStatus[] = ["draft", "cancelled", "archived", "completed"];

function windowAt(now: string, eventStatus: EventStatus = "registration_open") {
  return {
    eventStatus,
    registrationOpensAt: OPENS,
    registrationClosesAt: CLOSES,
    now: new Date(now),
  };
}

describe("活动状态是否允许报名（穷举九个状态）", () => {
  it("九个状态一个不漏地被判定", () => {
    expect(EVENT_STATUSES.length).toBe(9);
    for (const status of EVENT_STATUSES) {
      expect(typeof isEventStatusOpenForRegistration(status)).toBe("boolean");
    }
  });

  for (const status of EVENT_STATUSES) {
    const shouldAllow = !BLOCKING_STATUSES.includes(status);
    it(`${status} → ${shouldAllow ? "可以报名" : "不能报名"}`, () => {
      expect(isEventStatusOpenForRegistration(status)).toBe(shouldAllow);
    });
  }

  it("草稿、已取消、已归档、已完成都不能报名", () => {
    for (const status of BLOCKING_STATUSES) {
      expect(isEventStatusOpenForRegistration(status), status).toBe(false);
    }
  });
});

describe("报名窗口的边界（方向必须与数据库一致）", () => {
  it("开放前一毫秒 → 还没开放", () => {
    expect(registrationWindowState(windowAt("2026-10-08T00:59:59.999Z"))).toBe("not_open_yet");
  });

  it("恰好等于开放时刻 → 已开放（数据库是 now() >= opens_at）", () => {
    expect(registrationWindowState(windowAt("2026-10-08T01:00:00.000Z"))).toBe("open");
  });

  it("开放期间 → 开放中", () => {
    expect(registrationWindowState(windowAt("2026-10-10T00:00:00.000Z"))).toBe("open");
  });

  it("截止前一毫秒 → 仍然开放", () => {
    expect(registrationWindowState(windowAt("2026-10-14T14:59:59.999Z"))).toBe("open");
  });

  it("恰好等于截止时刻 → 已关闭（数据库是 now() < closes_at）", () => {
    expect(registrationWindowState(windowAt("2026-10-14T15:00:00.000Z"))).toBe("closed");
  });

  it("截止之后 → 已关闭", () => {
    expect(registrationWindowState(windowAt("2026-10-20T00:00:00.000Z"))).toBe("closed");
  });

  it("活动本身不可报名时，无论时间都返回 event_not_available", () => {
    for (const status of BLOCKING_STATUSES) {
      expect(registrationWindowState(windowAt("2026-10-10T00:00:00.000Z", status)), status).toBe(
        "event_not_available",
      );
    }
  });

  it("活动状态优先于时间：草稿活动即使在报名窗口内也不能报名", () => {
    expect(registrationWindowState(windowAt("2026-10-10T00:00:00.000Z", "draft"))).toBe(
      "event_not_available",
    );
  });

  it("每种状态都有中文说明（除了 open 不需要）", () => {
    const states: RegistrationWindowState[] = [
      "event_not_available",
      "not_open_yet",
      "open",
      "closed",
    ];
    for (const state of states) {
      expect(REGISTRATION_WINDOW_MESSAGES[state]).toBeDefined();
    }
    // open 是可以报名的状态，不应该有"不能报名"的说明
    expect(REGISTRATION_WINDOW_MESSAGES.open).toBe("");
    for (const state of states.filter((s) => s !== "open")) {
      expect(REGISTRATION_WINDOW_MESSAGES[state].length).toBeGreaterThan(0);
    }
  });
});

describe("能否报名：窗口 × 已有报名的全部组合", () => {
  const EXISTING = [
    null,
    "registered",
    "cancelled",
    "late_cancelled",
    "checked_in",
    "no_show",
  ] as const;

  for (const existing of EXISTING) {
    it(`窗口开放 + 已有报名状态=${existing ?? "无"}`, () => {
      const result = checkRegistration({
        window: windowAt("2026-10-10T00:00:00.000Z"),
        existingRegistrationStatus: existing,
      });

      if (existing === null || existing === "cancelled" || existing === "late_cancelled") {
        expect(result.allowed).toBe(true);
      } else {
        expect(result.allowed).toBe(false);
        if (!result.allowed) expect(result.code).toBe("already_registered");
      }
    });
  }

  it("窗口未开放时，即使从未报名也不能报", () => {
    const result = checkRegistration({
      window: windowAt("2026-10-01T00:00:00.000Z"),
      existingRegistrationStatus: null,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.code).toBe("not_open_yet");
  });

  it("窗口关闭后，即使取消过也不能重新报名", () => {
    const result = checkRegistration({
      window: windowAt("2026-10-20T00:00:00.000Z"),
      existingRegistrationStatus: "cancelled",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.code).toBe("closed");
  });

  it("取消后可以重新报名（Phase 0 决定：状态回退，不新增第二行）", () => {
    for (const status of ["cancelled", "late_cancelled"] as const) {
      const result = checkRegistration({
        window: windowAt("2026-10-10T00:00:00.000Z"),
        existingRegistrationStatus: status,
      });
      expect(result.allowed, status).toBe(true);
    }
  });

  it("未到场的学生不能自助重新报名，提示联系管理员", () => {
    const result = checkRegistration({
      window: windowAt("2026-10-10T00:00:00.000Z"),
      existingRegistrationStatus: "no_show",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toContain("管理员");
  });
});

describe("取消记为哪种状态（规范 9.2 第 5 条）", () => {
  it("截止前 → cancelled", () => {
    expect(cancellationStatus(CLOSES, new Date("2026-10-14T14:59:59.999Z"))).toBe("cancelled");
  });

  it("恰好等于截止时刻 → late_cancelled（与「截止即关闭」同方向）", () => {
    expect(cancellationStatus(CLOSES, new Date("2026-10-14T15:00:00.000Z"))).toBe("late_cancelled");
  });

  it("截止后 → late_cancelled", () => {
    expect(cancellationStatus(CLOSES, new Date("2026-10-20T00:00:00.000Z"))).toBe("late_cancelled");
  });

  it("报名开放之前取消也算 cancelled（活动还没开始，不算迟）", () => {
    expect(cancellationStatus(CLOSES, new Date("2026-10-01T00:00:00.000Z"))).toBe("cancelled");
  });
});

describe("赛制可选性（与数据库的 is_format_selectable_for_registration 一致）", () => {
  const choices = [
    { formatId: "pf", eventFormatEnabled: true, studentEligible: true },
    { formatId: "wsdc-not-enabled", eventFormatEnabled: false, studentEligible: true },
    { formatId: "wsdc-not-eligible", eventFormatEnabled: true, studentEligible: false },
    { formatId: "both-missing", eventFormatEnabled: false, studentEligible: false },
  ];

  it("只有同时满足两个条件的才可选", () => {
    expect(partitionFormatChoices(choices).selectable).toEqual(["pf"]);
  });

  it("两个条件缺一不可：只启用不合格、或合格但没启用，都不能选", () => {
    const { blocked } = partitionFormatChoices(choices);
    expect(blocked.map((entry) => entry.formatId).sort()).toEqual([
      "both-missing",
      "wsdc-not-eligible",
      "wsdc-not-enabled",
    ]);
  });

  it("不可选时给出**具体原因**，而不是只把它藏起来", () => {
    const { blocked } = partitionFormatChoices(choices);
    // 没启用的原因是"活动没开这个赛制"
    expect(blocked.find((entry) => entry.formatId === "wsdc-not-enabled")?.reason).toBe(
      "format_not_enabled",
    );
    // 不合格的原因是"你没有资格"
    expect(blocked.find((entry) => entry.formatId === "wsdc-not-eligible")?.reason).toBe(
      "student_not_eligible",
    );
    // 每条原因都有中文说明
    for (const entry of blocked) {
      expect(entry.message.length).toBeGreaterThan(0);
    }
  });

  it("没有任何赛制时返回空的可选列表（而不是报错）", () => {
    expect(partitionFormatChoices([])).toEqual({ selectable: [], blocked: [] });
  });

  it("全部可选时没有阻塞项", () => {
    const result = partitionFormatChoices([
      { formatId: "a", eventFormatEnabled: true, studentEligible: true },
      { formatId: "b", eventFormatEnabled: true, studentEligible: true },
    ]);
    expect(result.selectable).toEqual(["a", "b"]);
    expect(result.blocked).toEqual([]);
  });
});

describe("偏好名次校验", () => {
  it("连续且从 1 开始 → 通过", () => {
    expect(validatePreferenceRanks([1]).valid).toBe(true);
    expect(validatePreferenceRanks([1, 2, 3]).valid).toBe(true);
    expect(validatePreferenceRanks([]).valid).toBe(true);
  });

  it("顺序颠倒也算通过（顺序无关，集合正确即可）", () => {
    expect(validatePreferenceRanks([3, 1, 2]).valid).toBe(true);
  });

  it("重复名次被拒绝（数据库有唯一约束）", () => {
    const result = validatePreferenceRanks([1, 1]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("duplicate");
  });

  it("跳号被拒绝", () => {
    const result = validatePreferenceRanks([1, 3]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not_contiguous");
  });

  it("0 或负数或小数被拒绝", () => {
    for (const bad of [0, -1, 1.5]) {
      const result = validatePreferenceRanks([bad]);
      expect(result.valid, String(bad)).toBe(false);
    }
  });
});

/**
 * 跨层一致性：应用层的"禁止报名状态"清单必须与**迁移 SQL 里的那份**一致。
 *
 * 为什么需要这条：这条规则一共存在三份 ——
 *   1. 本模块的 `EVENT_STATUSES_BLOCKING_REGISTRATION`；
 *   2. 迁移里 `is_event_registration_open()` 的 `not in (...)`；
 *   3. `scripts/db-tests.sql` 的「报名窗口」一节用来对照的清单。
 *
 * 第 3 份能发现"数据库函数变了"，但发现不了"只有第 1 份变了" ——
 * 因为那条测试根本读不到 TypeScript。
 * 因此这里直接读 SQL 源文件比对，把缺口补上。
 * 若有人只改了一边，这条测试会失败，而不是等到用户看到
 * "界面说能报名、数据库却拒绝"才发现。
 */
describe("跨层一致性：与迁移 SQL 里的状态清单一致", () => {
  it("应用层清单与 is_event_registration_open() 的 not in (...) 完全相同", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260929091300_rls.sql"),
      "utf8",
    );

    // 从函数定义里抠出 not in ( 'a', 'b', ... ) 这一段
    const match = /status not in \(([^)]*)\)/.exec(sql);
    expect(match, "未能在迁移里找到 is_event_registration_open 的状态清单").not.toBeNull();

    const statusesInSql = (match as RegExpExecArray)[1]
      .split(",")
      .map((piece) => piece.trim().replace(/^'|'$/g, ""))
      .filter(Boolean)
      .sort();

    expect(statusesInSql).toEqual([...EVENT_STATUSES_BLOCKING_REGISTRATION].sort());
  });

  it("清单里的每个状态都是合法状态名（防止拼写错误）", () => {
    for (const status of EVENT_STATUSES_BLOCKING_REGISTRATION) {
      expect(EVENT_STATUSES).toContain(status);
    }
  });

  it("清单用排除法：只列出四种禁止状态，其余五种都允许", () => {
    expect(EVENT_STATUSES_BLOCKING_REGISTRATION.length).toBe(4);
    const allowed = EVENT_STATUSES.filter(
      (status) => !EVENT_STATUSES_BLOCKING_REGISTRATION.includes(status),
    );
    expect(allowed.length).toBe(5);
  });
});
