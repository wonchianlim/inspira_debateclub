// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  EVENT_HAPPY_PATH,
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  type EventStatus,
  canTransition,
  checkEventTransition,
  isTerminalStatus,
  nextHappyPathStatus,
  nextStatuses,
} from "@/lib/domain/event-lifecycle";

/**
 * 活动生命周期状态机。
 *
 * 测试策略（三层，各自能抓到不同的错误）：
 *   1. **穷举**：9×9 = 81 种组合逐一断言，与一份**独立写出的**期望清单比对。
 *      期望清单用"数对"的形式列出，与实现里的 `Record<状态, 状态[]>` 形状不同，
 *      因此任一处抄错都会被另一处发现。
 *   2. **性质**：断言几条与规范文字直接对应的普遍规律（正常路径是一条合法链、
 *      只有两个终态、没有任何状态能跳到自身等），这类断言能抓到"整体形状错了"。
 *   3. **边界**：非法输入、空字符串、篡改值等。
 */

/** 规范第 9.1 节的合法跳转，独立列成"数对"，作为实现的对照。 */
const ALLOWED_PAIRS: ReadonlyArray<readonly [EventStatus, EventStatus]> = [
  // 正常推进链
  ["draft", "registration_open"],
  ["registration_open", "registration_closed"],
  ["registration_closed", "pairing"],
  ["pairing", "ready"],
  ["ready", "live"],
  ["live", "completed"],
  ["completed", "archived"],
  // "may transition to cancelled before completion"：
  // completed 之前（不含 completed 本身）都可以取消
  ["draft", "cancelled"],
  ["registration_open", "cancelled"],
  ["registration_closed", "cancelled"],
  ["pairing", "cancelled"],
  ["ready", "cancelled"],
  ["live", "cancelled"],
];

const allowedSet = new Set(ALLOWED_PAIRS.map(([from, to]) => `${from}->${to}`));

describe("状态清单", () => {
  it("恰好是规范里的九个状态", () => {
    expect([...EVENT_STATUSES]).toEqual([
      "draft",
      "registration_open",
      "registration_closed",
      "pairing",
      "ready",
      "live",
      "completed",
      "archived",
      "cancelled",
    ]);
  });

  it("每个状态都有中文名称", () => {
    for (const status of EVENT_STATUSES) {
      expect(EVENT_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("穷举全部 9×9 = 81 种组合", () => {
  it("组合数确实是 81（防止清单被悄悄改短）", () => {
    expect(EVENT_STATUSES.length * EVENT_STATUSES.length).toBe(81);
  });

  for (const from of EVENT_STATUSES) {
    for (const to of EVENT_STATUSES) {
      const shouldAllow = allowedSet.has(`${from}->${to}`);

      it(`${from} → ${to} 应${shouldAllow ? "允许" : "拒绝"}`, () => {
        const result = checkEventTransition(from, to);
        expect(result.ok).toBe(shouldAllow);
        // canTransition 必须与 checkEventTransition 结论一致
        expect(canTransition(from, to)).toBe(shouldAllow);
      });
    }
  }

  it("合法跳转恰好 13 种", () => {
    let count = 0;
    for (const from of EVENT_STATUSES) {
      for (const to of EVENT_STATUSES) {
        if (canTransition(from, to)) count += 1;
      }
    }
    expect(count).toBe(ALLOWED_PAIRS.length);
    expect(count).toBe(13);
  });
});

describe("性质（与规范文字直接对应）", () => {
  it("正常路径的每一步都是合法跳转", () => {
    for (let i = 0; i < EVENT_HAPPY_PATH.length - 1; i += 1) {
      const from = EVENT_HAPPY_PATH[i];
      const to = EVENT_HAPPY_PATH[i + 1];
      expect(canTransition(from, to), `${from} → ${to} 应当是合法的`).toBe(true);
    }
  });

  it("只有 archived 与 cancelled 是终态", () => {
    const terminal = EVENT_STATUSES.filter((status) => isTerminalStatus(status));
    expect([...terminal].sort()).toEqual(["archived", "cancelled"]);
  });

  it("没有任何状态能跳到自身", () => {
    for (const status of EVENT_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("completed 之前的状态都可以取消（completed 之后不行）", () => {
    const cancellable: EventStatus[] = [
      "draft",
      "registration_open",
      "registration_closed",
      "pairing",
      "ready",
      "live",
    ];
    for (const status of cancellable) {
      expect(canTransition(status, "cancelled"), `${status} 应当可以取消`).toBe(true);
    }
    for (const status of ["completed", "archived", "cancelled"] as EventStatus[]) {
      expect(canTransition(status, "cancelled"), `${status} 不应当可以取消`).toBe(false);
    }
  });

  it("不允许回退：没有任何状态能回到 draft", () => {
    for (const status of EVENT_STATUSES) {
      expect(canTransition(status, "draft")).toBe(false);
    }
  });

  it("不允许跳步：draft 不能直接进入 ready 或 live", () => {
    expect(canTransition("draft", "ready")).toBe(false);
    expect(canTransition("draft", "live")).toBe(false);
    expect(canTransition("draft", "completed")).toBe(false);
  });

  it("nextHappyPathStatus 沿着正常路径推进，到 archived 后为 null", () => {
    expect(nextHappyPathStatus("draft")).toBe("registration_open");
    expect(nextHappyPathStatus("live")).toBe("completed");
    expect(nextHappyPathStatus("completed")).toBe("archived");
    expect(nextHappyPathStatus("archived")).toBeNull();
    expect(nextHappyPathStatus("cancelled")).toBeNull();
  });

  it("nextStatuses 与穷举结果一致", () => {
    for (const from of EVENT_STATUSES) {
      const expected = EVENT_STATUSES.filter((to) => canTransition(from, to));
      expect([...nextStatuses(from)].sort()).toEqual([...expected].sort());
    }
  });
});

describe("失败原因可精确判定（而不是去匹配文案）", () => {
  it("同一状态 → same_status", () => {
    const result = checkEventTransition("draft", "draft");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("same_status");
      expect(result.message).toContain("草稿");
    }
  });

  it("终态 → terminal_status", () => {
    const result = checkEventTransition("archived", "cancelled");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("terminal_status");
  });

  it("回退 / 跳步 → not_allowed，且提示里列出可选项", () => {
    const result = checkEventTransition("pairing", "draft");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_allowed");
      // 提示必须告诉用户"现在能做什么"，而不是只说"不行"
      expect(result.message).toContain("已就绪");
      expect(result.message).toContain("已取消");
    }
  });

  it("未知状态 → unknown_status", () => {
    expect(checkEventTransition("nonsense", "draft").ok).toBe(false);
    expect(checkEventTransition("draft", "nonsense").ok).toBe(false);

    const result = checkEventTransition("draft", "nonsense");
    if (!result.ok) expect(result.code).toBe("unknown_status");
  });
});

describe("健壮性与纯函数性质", () => {
  const garbage = ["", " ", "DRAFT", "draft ", "null", "undefined", "__proto__", "0"];

  it("任何垃圾输入都不抛异常，只返回失败结果", () => {
    for (const value of garbage) {
      expect(() => checkEventTransition(value, "draft")).not.toThrow();
      expect(() => checkEventTransition("draft", value)).not.toThrow();
      expect(checkEventTransition(value, "draft").ok).toBe(false);
      expect(checkEventTransition("draft", value).ok).toBe(false);
    }
  });

  it("大小写敏感：'DRAFT' 不是合法状态", () => {
    expect(checkEventTransition("DRAFT", "registration_open").ok).toBe(false);
  });

  it("是纯函数：重复调用结果一致，且不修改入参", () => {
    const from = "draft" as EventStatus;
    const to = "registration_open" as EventStatus;
    const first = checkEventTransition(from, to);
    const second = checkEventTransition(from, to);
    expect(first).toEqual(second);
    expect(from).toBe("draft");
    expect(to).toBe("registration_open");
  });

  it("失败结果里保留原始输入，便于记录与排查", () => {
    const result = checkEventTransition("draft", "live");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.from).toBe("draft");
      expect(result.to).toBe("live");
    }
  });
});
