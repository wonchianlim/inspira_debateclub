import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  STATUS_TONE_CLASSES,
  StatusBadge,
  StatusDot,
  type StatusTone,
} from "@/components/domain/status-badge";

import { classToHex, contrast } from "../helpers/design-tokens";

/**
 * 语义状态徽章（UI/UX 规范 §13.4「Status chips」、§5.2 颜色规则）。
 *
 * 这些测试锁的不是"好看"，而是**一致性**与**无障碍**两条硬要求。
 */

/**
 * 规范 §13.4 那张表有**七**个家族，不多不少。这里逐字列出来，
 * 下面用编译期断言逼它与组件真实的语气集合完全一致 ——
 * 否则将来有人加了一个"brand"语气，测试仍然全绿，而规范已经被违背。
 */
const SPEC_TONES = [
  "neutral", // Neutral
  "info", // Information
  "attention", // Attention
  "warning", // Pending
  "success", // Success
  "active", // Active
  "danger", // Error
] as const satisfies readonly StatusTone[];

type ToneMissingFromSpecList = Exclude<StatusTone, (typeof SPEC_TONES)[number]>;
/** 若下面一行报错，说明组件多了一种规范里没有的语气（或改了名字）。 */
const _specListIsComplete: ToneMissingFromSpecList extends never ? true : false = true;
void _specListIsComplete;

describe("语气决定颜色，调用方不挑色", () => {
  it("规范 §13.4 的每一个家族都有对应的语气，且各有各的类名", () => {
    expect(SPEC_TONES).toHaveLength(7);
    const classes = SPEC_TONES.map((tone) => {
      const { container } = render(<StatusBadge tone={tone}>状态</StatusBadge>);
      const el = container.querySelector("[data-tone]");
      expect(el, `${tone} 没有渲染出来`).not.toBeNull();
      return el?.className ?? "";
    });
    // 两种语气长得一样 = 等于没有区分
    expect(new Set(classes).size).toBe(SPEC_TONES.length);
  });

  it("同一语气重复渲染必须一致（颜色不能依赖顺序或随机）", () => {
    for (const tone of SPEC_TONES) {
      const first = render(<StatusBadge tone={tone}>x</StatusBadge>).container.innerHTML;
      const second = render(<StatusBadge tone={tone}>x</StatusBadge>).container.innerHTML;
      expect(second, `${tone} 两次渲染结果不同`).toBe(first);
    }
  });

  it("默认语气是中性（不传 tone 不会意外变成红或绿）", () => {
    const { container } = render(<StatusBadge>待定</StatusBadge>);
    expect(container.querySelector('[data-tone="neutral"]')).not.toBeNull();
  });

  /**
   * 规范 §5.2："Do not use semantic colours decoratively."
   *
   * 这条**反向**断言"进行中"用的是深蓝底白字，而不是某个语义色 ——
   * 因为 Live 属于 Active 家族，不是 Success（没有"成功"可言）。
   */
  it("「进行中」是 Active 家族（深蓝），不是绿色成功色", () => {
    const { container } = render(<StatusBadge tone="active">进行中</StatusBadge>);
    const cls = container.querySelector("[data-tone]")?.className ?? "";
    expect(cls).toContain("bg-primary");
    expect(cls).not.toContain("success");
  });
});

/**
 * 规范 §5.2 要求 "automated contrast verification"。
 *
 * ⚠️ 这里的底色与文字色**不是测试手抄的**，而是从组件真正会渲染的 class
 * （`STATUS_TONE_CLASSES`）反查 `globals.css` 里的令牌算出来的。
 * 手抄一份对照表的测试会在组件改了颜色之后继续通过 —— 那等于没有测试。
 *
 * ⚠️ 已知最紧的一条是 `neutral`：4.51:1，只比 AA 的 4.5 高一点点。
 * 这不是"差不多就行"，而是**必须**看着这个数字改令牌：
 * 谁把 `--neutral-bg` 或 `--text-muted-token` 调深一点，这条就会失败。
 */
describe("规范 §5.2 的自动对比度验证：徽章上的字必须读得清（≥ 4.5:1）", () => {
  it("七种语气的文字色在自己的底色上都达到 WCAG AA", () => {
    for (const tone of SPEC_TONES) {
      const utility = STATUS_TONE_CLASSES[tone];
      const background = /\bbg-([a-z0-9-]+)/.exec(utility)?.[1];
      const foreground = /\btext-([a-z0-9-]+)/.exec(utility)?.[1];
      expect(background, `${tone} 没有底色 class`).toBeTruthy();
      expect(foreground, `${tone} 没有文字色 class`).toBeTruthy();

      const ratio = contrast(classToHex(`bg-${background}`), classToHex(`text-${foreground}`));
      expect(
        ratio,
        `${tone}：文字色 --color-${foreground} 在 --color-${background} 上只有 ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("组件渲染出的确实就是这张表里的 class（否则上面的检查在检查空气）", () => {
    for (const tone of SPEC_TONES) {
      const { container } = render(<StatusBadge tone={tone}>状态</StatusBadge>);
      const cls = container.querySelector("[data-tone]")?.className ?? "";
      for (const utility of STATUS_TONE_CLASSES[tone].split(" ")) {
        expect(cls, `${tone} 渲染结果里缺少 ${utility}`).toContain(utility);
      }
    }
  });
});

describe("无障碍：颜色不能是唯一的信息载体（WCAG 1.4.1）", () => {
  it("文字始终与颜色同时存在 —— 色盲用户也能分辨", () => {
    render(<StatusBadge tone="danger">报名已关闭</StatusBadge>);
    expect(screen.getByText("报名已关闭")).toBeInTheDocument();
  });

  it("纯颜色圆点对屏幕阅读器隐藏（它自己不携带含义）", () => {
    const { container } = render(<StatusDot tone="success" />);
    const dot = container.firstElementChild;
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });

  it("徽章本身是一个普通 span，不冒充按钮或链接", () => {
    const { container } = render(<StatusBadge tone="info">进行中</StatusBadge>);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe("SPAN");
    expect(el?.getAttribute("role")).toBeNull();
  });
});
