/**
 * 活动的"在哪打"（UI/UX 规范 §8.1/§8.2 要求的 venue/online label）。
 *
 * 为什么单独成文件：这句话要出现在**四个地方** —— 管理端活动详情、学生活动列表、
 * 学生活动详情、学生首页的 hero。四处各写一遍三目，就会出现
 * "同一个活动在列表里显示线上、在详情里显示场地"这种没人会写测试的分歧。
 *
 * ⚠️ 活动表里有两个互不排斥的字段：
 *   - `venue`：线下场地
 *   - `meeting_url`：线上会议链接
 * 线上活动只有链接，线下活动只有场地，**混合活动两者都有**（线下为主、同时开直播）。
 * 因此场地优先：有场地就显示场地，"线上"只用于"只有链接、没有场地"的情况。
 * 链接本身在活动详情页会单独、完整地列出来，不会因为这里显示场地而丢失。
 */

export type EventLocationKind =
  /** 有线下场地（可能同时也有线上链接） */
  | "venue"
  /** 只有线上链接 */
  | "online"
  /** 两者都还没定（活动还是草稿时很常见） */
  | "unknown";

export type EventLocation = {
  kind: EventLocationKind;
  /** 直接可以显示给学生的一行字 */
  label: string;
};

/** 两者都没填时的显示文字。刻意写成"待定"而不是空白 —— 空白会让人以为界面坏了。 */
export const UNKNOWN_LOCATION_LABEL = "地点待定";

export function describeEventLocation(event: {
  venue: string | null;
  meetingUrl: string | null;
}): EventLocation {
  const venue = event.venue?.trim();
  if (venue) return { kind: "venue", label: venue };

  const meetingUrl = event.meetingUrl?.trim();
  if (meetingUrl) return { kind: "online", label: "线上" };

  return { kind: "unknown", label: UNKNOWN_LOCATION_LABEL };
}
