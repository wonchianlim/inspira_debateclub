"use client";

import { useTransition } from "react";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { setLocaleAction } from "@/lib/i18n/actions";

/**
 * 语言切换器（页头右上角）。
 *
 * ⚠️ 用 `<select>` 而不是两个按钮：语言可能增加，
 * 而且原生控件**天然支持键盘操作与屏幕阅读器**，不用自己实现。
 */
export function LocaleSwitcher({ current, label }: { current: Locale; label: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        aria-label={label}
        value={current}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => {
            void setLocaleAction(next);
          });
        }}
        className="border-border bg-background text-foreground focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-xs focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
