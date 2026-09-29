import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * 表单字段的统一外壳：标签 + 控件 + 可选的说明/错误。
 *
 * 可访问性要点（主规格第 13 节，WCAG 2.2 AA）：
 *   - 每个控件都有**显式关联**的 `<label>`（不是仅靠 placeholder）；
 *   - 错误信息用 `role="alert"` 立即播报，并由控件的 `aria-describedby` 指向；
 *   - 控件在出错时设置 `aria-invalid`，屏幕阅读器可感知。
 *
 * 控件本身由调用方传入，因为不同字段需要不同的 `aria-describedby` 组合。
 */
export function FormField({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** 组合出控件应当设置的 aria-describedby（说明与错误可能同时存在）。 */
export function describedBy(
  id: string,
  options: { error?: string; hint?: string },
): string | undefined {
  const ids = [
    options.hint && !options.error ? `${id}-hint` : null,
    options.error ? `${id}-error` : null,
  ].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}
