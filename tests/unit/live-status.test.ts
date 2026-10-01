// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  LIVE_STATES,
  type LiveStatusInput,
  computeLiveStatus,
  isOverdue,
  liveStateUrgency,
  summarizeLiveCounts,
} from "@/lib/domain/live-status";

/**
 * 现场状态（规范第 2.8 节）。
 *
 * 规范给了六个**语义**状态和三条时间规则，测试逐条对应：
 *   - 警告时刻之前缺人 ⇒ neutral；警告时刻之后缺人 ⇒ warning；
 *   - 计划开始时间已过却未开始 ⇒ overdue（规范："unresolved rooms become critical"）；
 *   - ready 要求**学生与裁判都到齐**。
 */

const WARNING_AT = new Date("2026-10-01T11:20:00.000Z"); // 19:20 +08
const START_AT = new Date("2026-10-01T12:00:00.000Z"); // 20:00 +08

function input(overrides: Partial<LiveStatusInput> = {}): LiveStatusInput {
  return {
    matchStatus: "scheduled",
    scheduledStart: START_AT,
    warningAt: WARNING_AT,
    now: new Date("2026-10-01T10:00:00.000Z"), // 警告前 80 分钟
    requiredParticipantCount: 4,
    presentParticipantCount: 4,
    requiredJudgeCount: 1,
    presentJudgeCount: 1,
    ballotSubmitted: false,
    published: false,
    ...overrides,
  };
}

describe("六个语义状态与规范一致", () => {
  it("语义状态恰好是规范列出的六个（不多不少）", () => {
    expect([...LIVE_STATES]).toEqual([
      "neutral",
      "warning",
      "ready",
      "live",
      "complete",
      "cancelled",
    ]);
  });
});

describe("neutral 与 warning 的分界是**警告时刻**", () => {
  it("警告时刻之前缺人 → neutral", () => {
    const result = computeLiveStatus(
      input({ now: new Date("2026-10-01T10:00:00.000Z"), presentParticipantCount: 2 }),
    );
    expect(result.state).toBe("neutral");
  });

  it("警告时刻之后缺人 → warning", () => {
    const result = computeLiveStatus(
      input({ now: new Date("2026-10-01T11:30:00.000Z"), presentParticipantCount: 2 }),
    );
    expect(result.state).toBe("warning");
  });

  it("**恰好**在警告时刻 → warning（边界包含）", () => {
    const result = computeLiveStatus(input({ now: WARNING_AT, presentParticipantCount: 2 }));
    expect(result.state).toBe("warning");
  });

  it("警告时刻之前人已到齐 → ready（不必等到警告时刻）", () => {
    const result = computeLiveStatus(input({ now: new Date("2026-10-01T10:00:00.000Z") }));
    expect(result.state).toBe("ready");
  });
});

describe("ready 要求学生与裁判**都**到齐", () => {
  it("学生到齐但裁判没到 → 不是 ready", () => {
    const result = computeLiveStatus(
      input({ now: new Date("2026-10-01T11:30:00.000Z"), presentJudgeCount: 0 }),
    );
    expect(result.state).toBe("warning");
    expect(result.missing.join("")).toContain("裁判");
  });

  it("裁判到了但学生没到齐 → 不是 ready", () => {
    const result = computeLiveStatus(
      input({ now: new Date("2026-10-01T11:30:00.000Z"), presentParticipantCount: 3 }),
    );
    expect(result.state).toBe("warning");
    expect(result.missing.join("")).toContain("学生");
  });

  it("两边都缺时**两条原因都列出来**，而不是只报一条", () => {
    const result = computeLiveStatus(
      input({
        now: new Date("2026-10-01T11:30:00.000Z"),
        presentParticipantCount: 1,
        presentJudgeCount: 0,
      }),
    );
    expect(result.missing).toHaveLength(2);
  });

  it("人数超出需要时不会出现负数缺额", () => {
    const result = computeLiveStatus(input({ presentParticipantCount: 9, presentJudgeCount: 3 }));
    expect(result.missing).toHaveLength(0);
  });
});

describe("live / complete / cancelled 优先于缺人", () => {
  it("已开始的比赛 → live，即使有人没签到", () => {
    const result = computeLiveStatus(
      input({ matchStatus: "started", presentParticipantCount: 1, presentJudgeCount: 0 }),
    );
    expect(result.state).toBe("live");
  });

  it("评分表已提交 → complete", () => {
    const result = computeLiveStatus(input({ ballotSubmitted: true }));
    expect(result.state).toBe("complete");
  });

  it("已发布 → complete", () => {
    const result = computeLiveStatus(input({ published: true }));
    expect(result.state).toBe("complete");
  });

  it("已取消 → cancelled", () => {
    const result = computeLiveStatus(input({ matchStatus: "cancelled" }));
    expect(result.state).toBe("cancelled");
  });

  it("已取消的比赛**不算超时**", () => {
    const result = computeLiveStatus(
      input({ matchStatus: "cancelled", now: new Date("2026-10-01T13:00:00.000Z") }),
    );
    expect(result.overdue).toBe(false);
  });
});

describe("超时（规范：'unresolved rooms become critical'）", () => {
  it("计划开始时间之前不算超时", () => {
    expect(isOverdue(START_AT, new Date("2026-10-01T11:59:00.000Z"), "scheduled")).toBe(false);
  });

  it("**恰好**到计划开始时间即算超时（边界包含）", () => {
    expect(isOverdue(START_AT, START_AT, "scheduled")).toBe(true);
  });

  it("已开始的比赛不算超时", () => {
    expect(isOverdue(START_AT, new Date("2026-10-01T13:00:00.000Z"), "started")).toBe(false);
  });

  it("超时的比赛在汇总里被单独计数", () => {
    const results = [
      computeLiveStatus(input({ now: new Date("2026-10-01T13:00:00.000Z") })),
      computeLiveStatus(input({ now: new Date("2026-10-01T10:00:00.000Z") })),
    ];
    expect(summarizeLiveCounts(results).overdue).toBe(1);
  });
});

/*
 * ⚠️ 这个文件里原来还有一组「签到开放时间」的用例，它们测的是
 * `isCheckInOpen(startsAt, now)` —— 一个按写死的"开始前 30 分钟"计算的函数。
 * 那个函数是**错的**（管理员可以改掉这个默认值），已随实现一起删除。
 * 签到窗口的用例搬到了 `tests/unit/registration.test.ts`，
 * 参数改为活动自己的 `check_in_opens_at`。
 */

describe("汇总计数", () => {
  it("各状态分别计数，总数等于传入条数", () => {
    const results = [
      computeLiveStatus(input({ now: new Date("2026-10-01T10:00:00.000Z") })), // ready
      computeLiveStatus(
        input({ now: new Date("2026-10-01T11:30:00.000Z"), presentParticipantCount: 1 }),
      ), // warning
      computeLiveStatus(input({ matchStatus: "started" })), // live
      computeLiveStatus(input({ published: true })), // complete
    ];
    const counts = summarizeLiveCounts(results);
    expect(counts.total).toBe(4);
    expect(counts.ready).toBe(1);
    expect(counts.warning).toBe(1);
    expect(counts.live).toBe(1);
    expect(counts.complete).toBe(1);
    expect(counts.neutral).toBe(0);
  });

  it("没有比赛时全部为 0", () => {
    const counts = summarizeLiveCounts([]);
    expect(counts.total).toBe(0);
    expect(Object.values(counts).every((value) => value === 0)).toBe(true);
  });
});

describe("紧急程度（展示层，不映射到具体颜色）", () => {
  it("warning 是「立刻处理」", () => {
    expect(liveStateUrgency("warning")).toBe("act-now");
  });

  it("ready 是「留意」", () => {
    expect(liveStateUrgency("ready")).toBe("attention");
  });

  it("其余状态不需要额外动作", () => {
    for (const state of ["neutral", "live", "complete", "cancelled"] as const) {
      expect(liveStateUrgency(state)).toBe("none");
    }
  });
});

describe("确定性（规范第 17 节：从时间戳算，不依赖浏览器假设）", () => {
  it("相同输入重复计算结果完全一致", () => {
    const base = input();
    const runs = Array.from({ length: 20 }, () => computeLiveStatus(base));
    expect(runs.every((run) => run.state === runs[0]?.state)).toBe(true);
  });

  it("'现在'由调用方传入 —— 同样的输入在不同时刻不同，但同一时刻必然相同", () => {
    const atWarning = new Date("2026-10-01T11:30:00.000Z");
    const before = computeLiveStatus(input({ now: atWarning, presentParticipantCount: 1 }));
    const after = computeLiveStatus(input({ now: atWarning, presentParticipantCount: 1 }));
    expect(before).toEqual(after);
  });

  it("不修改入参", () => {
    const base = input();
    const snapshot = base.now.getTime();
    computeLiveStatus(base);
    expect(base.now.getTime()).toBe(snapshot);
  });

  it("返回距离警告与开始还有多少分钟（负数表示已过）", () => {
    const result = computeLiveStatus(input({ now: new Date("2026-10-01T11:00:00.000Z") }));
    expect(result.minutesUntilWarning).toBe(20);
    expect(result.minutesUntilStart).toBe(60);
  });
});
