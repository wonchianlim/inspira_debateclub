import Image from "next/image";

import { useMessages } from "@/lib/i18n/provider";

/**
 * 登录页的品牌面板（UI/UX 规范 §7.1）。
 *
 * 规范原文：
 *   "**Brand panel (left):** navy background, approved lion/wordmark,
 *    subtle cropped lion geometry, and:
 *
 *    INSPIRA
 *    DEBATE CLUB
 *
 *    Think clearly.
 *    Speak with purpose.
 *    Compete.
 *
 *    Debate, judging, and feedback for the INSPIRA community."
 *
 * ⚠️ 深蓝底上的对比度（规范 §5.2）：深蓝 `#071B45` 配白字是 16.78:1，
 * 是整站最高的一组。次级文字用 80% 不透明度，仍在 AA 之上 ——
 * 这个页面上**不出现品牌橙的文字**（橙在深蓝上对比度不足），
 * 规范也明确禁止把语义色/品牌橙当装饰。
 *
 * ⚠️ 它是 `use client` 组件：文案来自 `useMessages()`（客户端上下文）。
 * 服务端页面也能读文案，但登录表单本身是客户端组件，
 * 这里保持同一种取法，避免同一个页面出现两套取文案的方式。
 */
export function AuthBrandPanel({ className }: { className?: string }) {
  const m = useMessages();

  return (
    <section
      aria-label={m.common.appName}
      className={
        "bg-primary text-primary-foreground relative overflow-hidden rounded-lg px-6 py-8 md:px-8 md:py-12 " +
        (className ?? "")
      }
    >
      {/*
        被裁切的狮子几何图形：规范 §2.1 的"cropped lion geometry"。
        `aria-hidden` + 空 alt 是刻意的 —— 旁边就有品牌名，
        屏幕阅读器再念一遍图片只是噪音。装饰性图片就该这么处理。
      */}
      <Image
        src="/inspira-lion.png"
        alt=""
        aria-hidden="true"
        width={320}
        height={320}
        className="pointer-events-none absolute -right-16 -bottom-16 size-64 opacity-10"
      />

      <div className="relative flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Image
            src="/inspira-lion.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="size-8 shrink-0"
            priority
          />
          <span className="font-heading text-lg font-semibold tracking-tight">
            {m.common.appName.replace(" Debate Club", "")}
          </span>
        </div>

        <p className="font-heading text-2xl font-bold tracking-[0.2em]">{m.auth.brandClubLine}</p>

        <div className="flex flex-col gap-1">
          <p className="text-h3 font-semibold">{m.auth.brandTagline1}</p>
          <p className="text-h3 font-semibold">{m.auth.brandTagline2}</p>
          <p className="text-h3 font-semibold">{m.auth.brandTagline3}</p>
        </div>

        <p className="max-w-prose text-sm opacity-80">{m.auth.brandSupporting}</p>
      </div>
    </section>
  );
}
