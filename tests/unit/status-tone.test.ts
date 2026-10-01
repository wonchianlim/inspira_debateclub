import { describe, expect, it } from "vitest";

import {
  auditActionTone,
  ballotStatusTone,
  emailDeliveryTone,
  eventStatusTone,
  judgeApprovalTone,
  liveStateTone,
  matchStatusTone,
  noticeStatusTone,
  pairingProposalTone,
  profileStatusTone,
  registrationStatusTone,
  registrationWindowTone,
  reviewRequestTone,
} from "@/components/domain/status-tone";
import { BALLOT_STATUSES } from "@/lib/domain/ballot-lifecycle";
import { EVENT_STATUSES } from "@/lib/domain/event-lifecycle";
import { JUDGE_APPROVAL_STATUSES } from "@/lib/domain/judge-eligibility";
import { LIVE_STATES } from "@/lib/domain/live-status";
import { PROFILE_STATUSES } from "@/lib/validation/admin";

/**
 * 状态→语气映射表（规范 §13.4）。
 *
 * ⚠️ 这些测试锁的是**规范里的具体判断**，不是"函数能跑"。
 * 每一条断言都对应规范或领域规则里的一句话，注释写明是那一句 ——
 * 这样将来有人改颜色时，能看出自己撞上的是哪条约定。
 */

/** 规范 §13.4 的七个家族。映射表只能返回这七个之一。 */
const ALLOWED_TONES = new Set([
  "neutral",
  "info",
  "attention",
  "warning",
  "success",
  "active",
  "danger",
]);

describe("规范 §13.4：每个家族只认一种语义，不能靠调用方随手挑", () => {
  it("活动生命周期逐项对齐规范（Draft/Registration open/Live/Complete/Archived/Cancelled）", () => {
    // Neutral: Draft / Archived
    expect(eventStatusTone("draft")).toBe("neutral");
    expect(eventStatusTone("archived")).toBe("neutral");
    // Attention: Registration open
    expect(eventStatusTone("registration_open")).toBe("attention");
    // Information: Pairing released
    expect(eventStatusTone("pairing")).toBe("info");
    expect(eventStatusTone("ready")).toBe("info");
    // Active: In progress / Live
    expect(eventStatusTone("live")).toBe("active");
    // Success: Complete
    expect(eventStatusTone("completed")).toBe("success");
    // Error: Cancelled
    expect(eventStatusTone("cancelled")).toBe("danger");
  });

  it("活动状态**无一遗漏** —— 数据库新增枚举时这里会先失败", () => {
    for (const status of EVENT_STATUSES) {
      const tone = eventStatusTone(status);
      expect(ALLOWED_TONES.has(tone), `${status} 映射到了规范以外的语气 ${tone}`).toBe(true);
      expect(tone, `${status} 退化成了兜底值，说明映射表漏了它`).not.toBeUndefined();
    }
  });

  it("「已发布」是 Information（蓝），不是 Success（绿）", () => {
    // 规范 §13.4：Information = Published, Pairing released, Feedback available
    expect(ballotStatusTone("published")).toBe("info");
    expect(noticeStatusTone("published")).toBe("info");
    // Success 那一行只列了 Submitted / Complete / Approved 这些"做完了"的状态
    expect(ballotStatusTone("submitted")).toBe("success");
  });

  it("「待审批」是 Pending（琥珀），和「已批准」明确不同", () => {
    // 规范 §13.4：Pending = Ballot pending, Awaiting approval, Scheduled
    for (const status of JUDGE_APPROVAL_STATUSES) {
      expect(ALLOWED_TONES.has(judgeApprovalTone(status))).toBe(true);
    }
    expect(judgeApprovalTone("pending")).toBe("warning");
    expect(judgeApprovalTone("approved")).toBe("success");
    expect(judgeApprovalTone("pending")).not.toBe(judgeApprovalTone("approved"));
  });

  it("「已排定」是 Pending（规范把它写进了 Pending 家族）", () => {
    expect(matchStatusTone("scheduled")).toBe("warning");
    expect(noticeStatusTone("scheduled")).toBe("warning");
  });
});

describe("领域规则决定的那几处判断（这些正是「不能机械替换」的地方）", () => {
  /**
   * 规范 §9.2：截止前取消记 `cancelled`，截止后记 `late_cancelled`。
   * 前者是无惩罚的合规操作，后者才是提醒 —— 两者不能同色。
   */
  it("「已取消」与「迟取消」必须区分：前者中性、后者提醒", () => {
    expect(registrationStatusTone("cancelled")).toBe("neutral");
    expect(registrationStatusTone("late_cancelled")).toBe("warning");
    expect(registrationStatusTone("cancelled")).not.toBe(registrationStatusTone("late_cancelled"));
    // 未到场才是真正的负面记录
    expect(registrationStatusTone("no_show")).toBe("danger");
    // Success: Registered / Checked in
    expect(registrationStatusTone("registered")).toBe("success");
    expect(registrationStatusTone("checked_in")).toBe("success");
  });

  /**
   * ⚠️ 反向断言：迁移前"毕业停用"和"违规暂停"都是红色，
   * 看起来一样。这条防止有人改回去。
   */
  it("「已停用」与「已暂停」不能同色（毕业 ≠ 违规）", () => {
    expect(profileStatusTone("inactive")).toBe("neutral");
    expect(profileStatusTone("suspended")).toBe("danger");
    expect(profileStatusTone("inactive")).not.toBe(profileStatusTone("suspended"));
    expect(profileStatusTone("active")).toBe("success");
  });

  it("账号状态逐项都有语气，没有漏网的", () => {
    for (const status of PROFILE_STATUSES) {
      expect(ALLOWED_TONES.has(profileStatusTone(status))).toBe(true);
    }
  });

  it("评分表五个状态与现场看板六个状态都各有语气", () => {
    for (const status of BALLOT_STATUSES) {
      expect(ALLOWED_TONES.has(ballotStatusTone(status))).toBe(true);
    }
    for (const state of LIVE_STATES) {
      expect(ALLOWED_TONES.has(liveStateTone(state))).toBe(true);
    }
    // Live 属于 Active 家族，不是 Success
    expect(liveStateTone("live")).toBe("active");
    expect(liveStateTone("warning")).toBe("danger");
  });

  it("报名窗口：开放才是 Attention（橙色），关闭不是红色错误", () => {
    expect(registrationWindowTone("open")).toBe("attention");
    expect(registrationWindowTone("closed")).toBe("neutral");
    expect(registrationWindowTone("not_open_yet")).toBe("neutral");
    expect(registrationWindowTone("event_not_available")).toBe("neutral");
  });

  it("只把「删除」「失败」这类真正的坏消息染红", () => {
    expect(auditActionTone("delete")).toBe("danger");
    // 新增/修改不该报警 —— 审计日志里满屏红色就没法看了
    expect(auditActionTone("insert")).toBe("neutral");
    expect(auditActionTone("update")).toBe("neutral");
    expect(emailDeliveryTone("failed")).toBe("danger");
    expect(emailDeliveryTone("sent")).toBe("success");
    expect(emailDeliveryTone("pending")).toBe("neutral");
  });

  it("复核请求与配对提案的映射与规范一致", () => {
    expect(reviewRequestTone("open")).toBe("attention"); // Attention: Needs attention
    expect(reviewRequestTone("resolved")).toBe("success");
    expect(reviewRequestTone("rejected")).toBe("danger");
    expect(pairingProposalTone("draft")).toBe("neutral");
    expect(pairingProposalTone("confirmed")).toBe("success");
    expect(pairingProposalTone("superseded")).toBe("neutral");
  });
});

describe("未知值一律退化成中性，而不是随便染成红或绿", () => {
  it("数据层多出一个枚举值时，界面显示成「普通」而不是报警", () => {
    expect(matchStatusTone("some_future_status")).toBe("neutral");
    expect(noticeStatusTone("some_future_status")).toBe("neutral");
    expect(emailDeliveryTone("some_future_status")).toBe("neutral");
    expect(auditActionTone("some_future_action")).toBe("neutral");
    expect(reviewRequestTone("some_future_status")).toBe("neutral");
    expect(matchStatusTone("")).toBe("neutral");
  });
});
