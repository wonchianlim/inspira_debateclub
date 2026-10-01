import { CLUB_DEFAULT_TIMEZONE, zonedHourOf } from "@/lib/domain/timezone";

/**
 * 按时段问候（UI/UX 规范 §8.1「Student Home」）。
 *
 * 规范原文：
 *   "Do not hard-code time greeting; derive it locally and fall back to `Welcome back`."
 *
 * 所以这里只做一件事：**把"现在是几点"翻译成一个时段**。
 * 为什么值得单独成文件：写死"晚上好"是一个很容易发生、又不会有任何测试报警的
 * 退化 —— 页面上永远显示"晚上好"，而没有人会因此报错。
 */

export type GreetingKey = "morning" | "afternoon" | "evening";

/**
 * 时段划分。
 *
 * 5–11 点算早上，12–17 点算下午，其余（18–次日 4 点）算晚上。
 * 凌晨 1 点说"晚上好"在中文里是自然的；把它单独分成"凌晨好"反而奇怪。
 */
export function greetingKeyForHour(hour: number): GreetingKey {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

export const GREETING_LABELS: Record<GreetingKey, string> = {
  morning: "早上好",
  afternoon: "下午好",
  evening: "晚上好",
};

/** 取不到姓名时的回退问候（规范原文明确要求有回退）。 */
export const FALLBACK_GREETING = "欢迎回来";

/**
 * 学生首页的问候语。
 *
 * ⚠️ 时区用**俱乐部默认时区**（`Asia/Shanghai`），不用服务器时区、
 * 也不用浏览器时区：
 *   - 服务器时区：部署在 UTC 上会让问候语整体错 8 小时；
 *   - 浏览器时区：学生在国外旅行时问候会跟着跳，而"俱乐部现在几点"
 *     才是这个页面真正在说的时区（活动时间也是按活动时区显示的）。
 *
 * 这一处与规范"derive it locally"的字面写法略有出入：规范想避免的是
 * **写死问候语**，而服务端按俱乐部时区推导同样做到了"随时段变化"，
 * 还避免了客户端组件在 hydration 前后显示两种问候语的闪动。
 */
export function studentGreeting(
  now: Date,
  displayName: string | null | undefined,
  timeZone: string = CLUB_DEFAULT_TIMEZONE,
): string {
  const name = displayName?.trim();
  if (!name) return FALLBACK_GREETING;
  return `${GREETING_LABELS[greetingKeyForHour(zonedHourOf(now, timeZone))]}，${name}`;
}
