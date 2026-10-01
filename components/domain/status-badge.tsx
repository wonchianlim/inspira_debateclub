import { cn } from "@/lib/utils";

/**
 * 语义状态徽章（UI/UX 规范 §5.2、§1.4 原则 4「Status over decoration」）。
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
 *   "Do not use semantic colours decoratively."
 *   红只用于错误与破坏性操作，绿只用于成功，琥珀只用于警告/等待。
 *   因此这里的 tone 是有语义的，不该拿来"让页面好看一点"。
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-neutral-bg text-muted-foreground",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  brand: "bg-brand-tint text-foreground",
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
        TONE_CLASSES[tone],
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
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    brand: "bg-brand",
  };
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", dot[tone], className)}
    />
  );
}
