// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  MAX_DELIVERY_ATTEMPTS,
  RETRY_BASE_MINUTES,
  RETRY_MAX_MINUTES,
  type DeliveryRow,
  decideDelivery,
  onDeliveryFailed,
  onDeliverySucceeded,
  retryDelayMinutes,
  selectDueForDelivery,
} from "@/lib/domain/email-delivery";

/**
 * 邮件投递的重试与调度（Phase 9 的 "Retry/observability"）。
 *
 * 这部分与"用哪家服务商"无关，因此**现在就能写完并测透** ——
 * 接上腾讯云邮件推送时只需要实现"真的发出这一封"。
 */

const NOW = new Date("2026-05-01T10:00:00.000Z");
const past = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const future = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function row(overrides: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    id: "m1",
    status: "pending",
    attempts: 0,
    scheduledAt: past(1),
    ...overrides,
  };
}

describe("退避计算", () => {
  it("还没试过时不需要等待", () => {
    expect(retryDelayMinutes(0)).toBe(0);
  });

  it("按指数增长：2、4、8……", () => {
    expect(retryDelayMinutes(1)).toBe(RETRY_BASE_MINUTES);
    expect(retryDelayMinutes(2)).toBe(RETRY_BASE_MINUTES * 2);
    expect(retryDelayMinutes(3)).toBe(RETRY_BASE_MINUTES * 4);
  });

  it("有上限 —— 否则第五次重试要等半小时，通知早就没意义了", () => {
    expect(retryDelayMinutes(10)).toBe(RETRY_MAX_MINUTES);
    expect(retryDelayMinutes(5)).toBeLessThanOrEqual(RETRY_MAX_MINUTES);
  });
});

describe("该不该发", () => {
  it("到时间了就该发", () => {
    expect(decideDelivery(row(), NOW).action).toBe("send");
  });

  it("还没到时间就等", () => {
    const decision = decideDelivery(row({ scheduledAt: future(5) }), NOW);
    expect(decision.action).toBe("wait");
  });

  it("已发出或已取消的不再处理", () => {
    for (const status of ["sent", "cancelled"] as const) {
      expect(decideDelivery(row({ status }), NOW).action, status).toBe("give_up");
    }
  });

  /**
   * ⚠️ 到顶之后**放弃**，而不是继续重试。
   *
   * "永远重试"看起来更努力，实际后果是队列里堆着一批发不出去的信，
   * 而管理员在界面上看到的是"还在尝试" —— 那会掩盖真正的问题。
   */
  it(`试满 ${MAX_DELIVERY_ATTEMPTS} 次后放弃，交给人工`, () => {
    const decision = decideDelivery(row({ attempts: MAX_DELIVERY_ATTEMPTS }), NOW);
    expect(decision.action).toBe("give_up");
    if (decision.action === "give_up") {
      expect(decision.reason).toContain("人工");
    }
  });

  it("时间戳坏掉时放弃，而不是'当作现在'悄悄发出去", () => {
    const decision = decideDelivery(row({ scheduledAt: "不是时间" }), NOW);
    expect(decision.action).toBe("give_up");
  });
});

describe("挑选可以发的", () => {
  it("只挑到时间的，并按计划时间从早到晚", () => {
    const rows = [
      row({ id: "later", scheduledAt: past(1) }),
      row({ id: "earliest", scheduledAt: past(30) }),
      row({ id: "notyet", scheduledAt: future(10) }),
    ];
    expect(selectDueForDelivery(rows, NOW).map((r) => r.id)).toEqual(["earliest", "later"]);
  });

  it("没有可发的就返回空数组", () => {
    expect(selectDueForDelivery([row({ scheduledAt: future(60) })], NOW)).toHaveLength(0);
  });

  it("不修改入参", () => {
    const rows = [row(), row({ id: "m2" })];
    const snapshot = JSON.stringify(rows);
    selectDueForDelivery(rows, NOW);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe("成功", () => {
  it("标记为已发送并记录时间", () => {
    const result = onDeliverySucceeded();
    expect(result.status).toBe("sent");
    expect(result.sentAt).toBeTruthy();
    expect(result.lastError).toBeNull();
  });
});

/**
 * ⚠️ 第一版很容易写成"失败就 failed"，那样重试永远不会发生 ——
 * 而"重试"正是规范这一节要求的东西。
 */
describe("失败：还能再试 vs 到顶", () => {
  it("还能再试时回到 pending，并算出下次该在什么时候试", () => {
    const result = onDeliveryFailed(0, "smtp timeout", NOW);
    expect(result.status).toBe("pending");
    expect(result.attempts).toBe(1);
    expect(result.lastError).toBe("smtp timeout");
    // 第 1 次失败后等 RETRY_BASE_MINUTES 分钟
    expect(new Date(result.scheduledAt).getTime()).toBe(
      NOW.getTime() + RETRY_BASE_MINUTES * 60_000,
    );
  });

  it("失败原因**一定**要留下 —— 没有它管理员无从下手", () => {
    for (const attempts of [0, MAX_DELIVERY_ATTEMPTS - 2]) {
      expect(onDeliveryFailed(attempts, "smtp timeout", NOW).lastError).toBe("smtp timeout");
    }
  });

  it("到顶时标记为 failed（数据库的 check 约束要求 failed 必须带原因）", () => {
    const result = onDeliveryFailed(MAX_DELIVERY_ATTEMPTS - 1, "smtp timeout", NOW);
    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(result.lastError).toBeTruthy();
  });

  it("重试间隔逐次变长", () => {
    const first = new Date(onDeliveryFailed(0, "e", NOW).scheduledAt).getTime();
    const second = new Date(onDeliveryFailed(1, "e", NOW).scheduledAt).getTime();
    expect(second).toBeGreaterThan(first);
  });
});
