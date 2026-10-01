import { cn } from "@/lib/utils";

/**
 * 语义状态徽章（UI/UX 规范 §13.4「Status chips」）。
 *
 * ⚠️ 为什么需要它：在它之前，全项目有 52 处 `<Badge>`，各自决定用什么颜色 ——
 * 于是"已发布"在一处是灰、在另一处是蓝，"待处理"有的黄有的红。
 *
 * 规范 §1.2 目标 6 要求的正是这件事：
 *   "Standardise status, terminology, interaction patterns,
 *    and empty/error handling across the product."
 *
 * 用法：**先决定语气（tone），再决定文案**。颜色不再由调用方挑。
 *
 * ⚠️ 规范 §5.2 的硬约束：
 *   "Red is only for destructive actions and errors.
 *    Green is only for success/complete. Amber is only for warning/pending.
 *    Do not use semantic colours decoratively."
 *   因此这里的 tone 是有语义的，不该拿来"让页面好看一点"。
 *
 * ⚠️ 七种语气与规范 §13.4 那张表**一一对应**（不是六种也不是八种）：
 *
 *   | 规范里的 Status family | 例子                                | 本组件的语气 |
 *   |------------------------|-------------------------------------|--------------|
 *   | Neutral                | Draft, Not started, Archived        | neutral      |
 *   | Information            | Published, Pairing released         | info         |
 *   | Attention              | Registration open, Needs attention  | attention    |
 *   | Pending                | Ballot pending, Awaiting approval   | warning      |
 *   | Success                | Registered, Submitted, Complete     | success      |
 *   | Active                 | In progress, Live                   | active       |
 *   | Error                  | Failed, Conflict, Declined          | danger       |
 *
 * 具体某个业务状态该用哪一种，**不要在这里临时判断** ——
 * 统一写在 `components/domain/status-tone.ts`，那里一处改动全站生效。
 */
export type StatusTone =
  /** 中性：草稿、已归档、未开始 */
  | "neutral"
  /** 信息：已发布、配对已放出、反馈可看 */
  | "info"
  /** 注意：报名开放、签到开放、需要你处理 */
  | "attention"
  /** 等待：待审批、已排定、评分表待提交 */
  | "warning"
  /** 成功：已报名、已签到、已提交、已完成、已批准 */
  | "success"
  /** 进行中：比赛进行中、当前使用的版本 */
  | "active"
  /** 错误：失败、冲突、已拒绝、已取消 */
  | "danger";

/**
 * 语气 → Tailwind class。
 *
 * ⚠️ 导出它是为了给**测试**用：对比度检查必须作用在组件真正会渲染出来的
 * class 上。如果测试另外手抄一份"哪个语气配哪个底色"，两者一旦不同步，
 * 测试就会一边通过一边失去意义（规范 §5.2 要求的是自动验证，不是自动装样子）。
 */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-neutral-bg text-muted-foreground",
  info: "bg-info-bg text-info",
  // 规范：orange/warning tint with **dark** text（橙底上不用白字，对比度不够）
  attention: "bg-brand-tint text-foreground",
  warning: "bg-warning-bg text-warning",
  success: "bg-success-bg text-success",
  // 规范：navy background, white text plus text label
  active: "bg-primary text-primary-foreground",
  danger: "bg-danger-bg text-danger",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: StatusTone }) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        STATUS_TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/**
 * 圆点，用于在密集列表里表达状态而不占地方。
 *
 * ⚠️ `aria-hidden` 是刻意的：颜色**不能是唯一的信息载体**
 * （WCAG 1.4.1）。所以这个圆点永远要和文字一起用，
 * 它自己不该被读出来 —— 否则屏幕阅读器会念出一个没有含义的"圆点"。
 */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  const dot: Record<StatusTone, string> = {
    neutral: "bg-muted-foreground",
    info: "bg-info",
    attention: "bg-brand",
    warning: "bg-warning",
    success: "bg-success",
    active: "bg-primary",
    danger: "bg-danger",
  };
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", dot[tone], className)}
    />
  );
}
