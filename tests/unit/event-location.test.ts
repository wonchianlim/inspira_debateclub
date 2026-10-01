// @vitest-environment node
import { describe, expect, it } from "vitest";

import { UNKNOWN_LOCATION_LABEL, describeEventLocation } from "@/lib/domain/event-location";

/**
 * "在哪打"这一行字（规范 §8.1/§8.2 的 venue/online label）。
 *
 * 这条规则要出现在四个地方（管理端详情、学生活动列表、学生活动详情、学生首页 hero）。
 * 四处各写一遍三目，就会出现"同一个活动在列表里显示线上、在详情里显示场地"
 * 这种没有任何测试会覆盖的分歧 —— 所以它必须只有一处实现。
 */

describe("地点优先，线上只用于「只有链接」的情况", () => {
  it("有场地 → 显示场地", () => {
    expect(describeEventLocation({ venue: "教学楼 A101", meetingUrl: null })).toEqual({
      kind: "venue",
      label: "教学楼 A101",
    });
  });

  it("只有链接 → 线上", () => {
    expect(
      describeEventLocation({ venue: null, meetingUrl: "https://meet.example.com/x" }),
    ).toEqual({ kind: "online", label: "线上" });
  });

  /**
   * ⚠️ 混合活动（线下为主 + 同时开直播）两者都有。
   * 场地是学生真正要去的那个信息，因此优先显示场地；
   * 链接在活动详情页仍然会单独、完整地列出来，不会丢。
   */
  it("场地与链接都有 → 显示场地（线下是学生要去的地方）", () => {
    const location = describeEventLocation({
      venue: "教学楼 A101",
      meetingUrl: "https://meet.example.com/x",
    });
    expect(location.kind).toBe("venue");
    expect(location.label).toBe("教学楼 A101");
  });

  it("两者都没有 → 「地点待定」，而不是空白", () => {
    // 空白会让学生以为界面坏了；草稿阶段两者都还没定是很常见的
    expect(describeEventLocation({ venue: null, meetingUrl: null })).toEqual({
      kind: "unknown",
      label: UNKNOWN_LOCATION_LABEL,
    });
  });

  it("空白字符串当作没填（管理员把输入框清空后不该显示一个空格）", () => {
    expect(describeEventLocation({ venue: "   ", meetingUrl: null }).kind).toBe("unknown");
    expect(describeEventLocation({ venue: "", meetingUrl: "  " }).kind).toBe("unknown");
    expect(describeEventLocation({ venue: " A101 ", meetingUrl: null }).label).toBe("A101");
  });
});
