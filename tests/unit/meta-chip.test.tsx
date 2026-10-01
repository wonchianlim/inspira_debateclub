import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetaChip } from "@/components/domain/meta-chip";

/**
 * 元数据标签（规范 §13.4 的补充：不是所有标签都是状态）。
 *
 * ⚠️ 这里最重要的一条是**反向**的：
 * 元数据标签必须是中性的、**不带语义色** —— 否则"BP"这种赛制代码
 * 会和真正的状态（已发布/待审批）抢注意力，规范 §5.2 禁止的
 * "用语义色做装饰"就发生了。
 */

describe("元数据标签必须是中性的", () => {
  it("绝不使用任何语义色 —— 赛制代码不该染成红绿黄蓝", () => {
    const { container } = render(<MetaChip>BP</MetaChip>);
    const cls = container.firstElementChild?.className ?? "";
    for (const forbidden of ["success", "danger", "warning", "info", "attention", "active"]) {
      expect(cls, `元数据标签出现了语义色 ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("外观与迁移前的 <Badge variant='outline' className='font-normal'> 一致（描边 + 常规字重）", () => {
    const { container } = render(<MetaChip>BP</MetaChip>);
    const cls = container.firstElementChild?.className ?? "";
    expect(cls).toContain("border-border");
    expect(cls).toContain("font-normal");
    expect(cls).not.toContain("font-medium");
  });

  it("保留调用方补充的 class（例如做间距）", () => {
    const { container } = render(<MetaChip className="mr-2">BP</MetaChip>);
    expect(container.firstElementChild?.className ?? "").toContain("mr-2");
  });

  it("渲染文字而不是靠颜色或图标传达信息", () => {
    render(<MetaChip>第 2 版</MetaChip>);
    expect(screen.getByText("第 2 版")).toBeInTheDocument();
  });
});
