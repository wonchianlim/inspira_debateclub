// @vitest-environment node
import { describe, expect, it } from "vitest";

import { noticeInputSchema, toNoticeRecord } from "@/lib/validation/notices";

/**
 * 通知的输入校验与换算。
 *
 * 重点验证两件事：
 *   1. **受众类型与目标列必须匹配** —— 与数据库的 CHECK 约束一一对应（P2-1 的 C12-C14）；
 *   2. **不相关的目标列会被强制清空** —— 否则会撞上数据库约束，
 *      用户看到的是一句数据库英文错误，而不是可理解的中文提示。
 */

const EVENT_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const FORMAT_ID = "cccccccc-0000-0000-0000-000000000001";

const BASE = {
  title: "虚构通知",
  body: "正文内容",
  audienceType: "global",
  publishMode: "draft",
  timezone: "Asia/Shanghai",
};

describe("受众与目标的匹配", () => {
  it("全体：不需要任何目标", () => {
    expect(noticeInputSchema.safeParse(BASE).success).toBe(true);
  });

  it("活动：必须填活动", () => {
    expect(
      noticeInputSchema.safeParse({ ...BASE, audienceType: "event", eventId: EVENT_ID }).success,
    ).toBe(true);
    const missing = noticeInputSchema.safeParse({ ...BASE, audienceType: "event" });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((i) => i.path.join("."))).toContain("eventId");
    }
  });

  it("角色：必须是五种角色之一", () => {
    expect(
      noticeInputSchema.safeParse({ ...BASE, audienceType: "role", role: "judge" }).success,
    ).toBe(true);
    expect(
      noticeInputSchema.safeParse({ ...BASE, audienceType: "role", role: "owner" }).success,
    ).toBe(false);
    expect(noticeInputSchema.safeParse({ ...BASE, audienceType: "role" }).success).toBe(false);
  });

  it("赛制：必须填赛制", () => {
    expect(
      noticeInputSchema.safeParse({ ...BASE, audienceType: "format", formatId: FORMAT_ID }).success,
    ).toBe(true);
    expect(noticeInputSchema.safeParse({ ...BASE, audienceType: "format" }).success).toBe(false);
  });

  it("全体却填了目标 → 被拒绝（数据库有同样的 CHECK）", () => {
    expect(
      noticeInputSchema.safeParse({ ...BASE, audienceType: "global", eventId: EVENT_ID }).success,
    ).toBe(false);
  });

  it("活动受众填的标识格式不对 → 被拒绝", () => {
    expect(
      noticeInputSchema.safeParse({ ...BASE, audienceType: "event", eventId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });
});

describe("发布方式", () => {
  it("草稿：published_at 为 NULL", () => {
    const parsed = noticeInputSchema.parse({ ...BASE, publishMode: "draft" });
    expect(toNoticeRecord(parsed).published_at).toBeNull();
  });

  it("立即发布：published_at 是当前时刻", () => {
    const before = Date.now();
    const parsed = noticeInputSchema.parse({ ...BASE, publishMode: "now" });
    const record = toNoticeRecord(parsed);
    expect(record.published_at).not.toBeNull();
    const published = new Date(record.published_at as string).getTime();
    expect(published).toBeGreaterThanOrEqual(before - 1000);
    expect(published).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("定时发布：按俱乐部的时区换算成 UTC", () => {
    const parsed = noticeInputSchema.parse({
      ...BASE,
      publishMode: "scheduled",
      publishedAtLocal: "2026-10-15T18:00",
    });
    // 上海 18:00 = UTC 10:00
    expect(toNoticeRecord(parsed).published_at).toBe("2026-10-15T10:00:00.000Z");
  });

  it("定时发布但没填时间 → 被拒绝", () => {
    const result = noticeInputSchema.safeParse({ ...BASE, publishMode: "scheduled" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join("."))).toContain("publishedAtLocal");
    }
  });

  it("时间格式不完整 → 被拒绝，而且不抛异常", () => {
    expect(
      noticeInputSchema.safeParse({ ...BASE, publishMode: "scheduled", publishedAtLocal: "" })
        .success,
    ).toBe(false);
    expect(
      noticeInputSchema.safeParse({ ...BASE, publishMode: "scheduled", publishedAtLocal: "明天" })
        .success,
    ).toBe(false);
  });
});

describe("过期时间", () => {
  it("必须晚于发布时间（数据库有同样的 CHECK：C17）", () => {
    const bad = noticeInputSchema.safeParse({
      ...BASE,
      publishMode: "scheduled",
      publishedAtLocal: "2026-10-15T18:00",
      expiresAtLocal: "2026-10-15T09:00",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.map((i) => i.path.join("."))).toContain("expiresAtLocal");
    }

    const good = noticeInputSchema.safeParse({
      ...BASE,
      publishMode: "scheduled",
      publishedAtLocal: "2026-10-15T18:00",
      expiresAtLocal: "2026-10-22T18:00",
    });
    expect(good.success).toBe(true);
  });

  it("可以留空（表示不过期）", () => {
    const parsed = noticeInputSchema.parse({ ...BASE, publishMode: "now", expiresAtLocal: "" });
    expect(toNoticeRecord(parsed).expires_at).toBeNull();
  });
});

describe("写入记录时清空不相关的目标列", () => {
  it("活动受众：只填 event_id", () => {
    const parsed = noticeInputSchema.parse({ ...BASE, audienceType: "event", eventId: EVENT_ID });
    const record = toNoticeRecord(parsed);
    expect(record.event_id).toBe(EVENT_ID);
    expect(record.role).toBeNull();
    expect(record.format_id).toBeNull();
  });

  it("角色受众：只填 role", () => {
    const parsed = noticeInputSchema.parse({ ...BASE, audienceType: "role", role: "coach" });
    const record = toNoticeRecord(parsed);
    expect(record.role).toBe("coach");
    expect(record.event_id).toBeNull();
    expect(record.format_id).toBeNull();
  });

  it("全体受众：三列全空", () => {
    const parsed = noticeInputSchema.parse(BASE);
    const record = toNoticeRecord(parsed);
    expect(record.event_id).toBeNull();
    expect(record.role).toBeNull();
    expect(record.format_id).toBeNull();
  });

  it("即使表单里塞了不相关的字段，也会被清空（防御伪造请求）", () => {
    // 注意：这里绕过 Zod 直接构造，模拟"请求里多带了字段"
    const parsed = noticeInputSchema.parse({
      ...BASE,
      audienceType: "global",
      // 故意带上不相关字段；schema 对 global 会拒绝，所以这里只验证 record 的行为
    });
    const record = toNoticeRecord({ ...parsed, eventId: EVENT_ID, role: "judge" } as never);
    expect(record.event_id).toBeNull();
    expect(record.role).toBeNull();
    expect(record.format_id).toBeNull();
  });
});

describe("标题与正文", () => {
  it("不能是空白", () => {
    expect(noticeInputSchema.safeParse({ ...BASE, title: "   " }).success).toBe(false);
    expect(noticeInputSchema.safeParse({ ...BASE, body: "   " }).success).toBe(false);
  });

  it("有长度上限", () => {
    expect(noticeInputSchema.safeParse({ ...BASE, title: "字".repeat(201) }).success).toBe(false);
    expect(noticeInputSchema.safeParse({ ...BASE, body: "字".repeat(5001) }).success).toBe(false);
  });
});
