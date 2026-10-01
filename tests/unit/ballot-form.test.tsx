import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BallotForm } from "@/app/(app)/judge/matches/[matchId]/ballot-form";
import type { BallotContext } from "@/lib/judge/ballots";

/**
 * 裁判评分表的**结构性**回归测试（规范 §9.3）。
 *
 * ⚠️ 这个文件存在的头号理由是一个真实缺陷：
 * 原来只有两个**各自只装着隐藏字段**的小 `<form>`，所有真正的输入框
 * （分数、胜方、判决理由）都在它们**外面** —— 于是 `formData.get("winnerTeamId")`
 * 与 `get("reasonForDecision")` 永远是 null。
 * 服务端要求这两项必填（PF 就是），结果是**任何 PF 评分表都提交不了**：
 * 裁判选完胜方、写完理由，点提交仍然被告知"请选择胜方"。
 *
 * 因此这里断言的不是"长什么样"，而是**浏览器真正会提交什么**
 * （用 `new FormData(form)` 构造，和真实提交走同一条路）。
 */

const CONTEXT: BallotContext = {
  matchId: "55555555-0000-0000-0000-000000000001",
  matchNumber: 3,
  roomName: "A101",
  formatCode: "PF",
  scheduledStart: "2026-10-20T10:00:00.000Z",
  matchStatus: "scheduled",
  templateId: "bb000000-0000-0000-0000-000000000001",
  templateName: "公共论坛式辩论（PF）",
  templateVersion: 1,
  schema: {
    schemaVersion: 1,
    winnerRequired: true,
    reasonForDecisionRequired: true,
    fields: [
      {
        key: "content",
        label: "Content",
        type: "score",
        scope: "speaker",
        required: true,
        min: 20,
        max: 30,
      },
    ],
  },
  speakers: [
    {
      studentId: "eeeeeeee-0000-0000-0000-000000000004",
      participationId: "11111111-0000-0000-0000-000000000004",
      displayName: "张三",
      teamId: "22222222-0000-0000-0000-000000000001",
      speakerPosition: 1,
    },
  ],
  teams: [
    { teamId: "22222222-0000-0000-0000-000000000001", teamLabel: "队伍 1", position: "PROP" },
    { teamId: "22222222-0000-0000-0000-000000000002", teamLabel: "队伍 2", position: "OPP" },
  ],
  speakerPositionByStudent: { "eeeeeeee-0000-0000-0000-000000000004": 1 },
  teamMembersByTeam: {
    "22222222-0000-0000-0000-000000000001": ["eeeeeeee-0000-0000-0000-000000000004"],
  },
  ballotId: null,
  ballotStatus: null,
  updatedAt: null,
  submittedAt: null,
  winnerTeamId: null,
  reasonForDecision: null,
  data: { speakerValues: {}, teamValues: {}, matchValues: {} },
};

function formElement(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector("form");
  if (!form) throw new Error("表单没有渲染出来");
  return form;
}

describe("浏览器真正会提交什么（这一组是为了那个真实缺陷）", () => {
  it("整个填写区都在**一个** form 里，隐藏字段也在里面", () => {
    const { container } = render(<BallotForm context={CONTEXT} />);
    const forms = container.querySelectorAll("form");
    expect(forms).toHaveLength(1);

    const data = new FormData(formElement(container));
    expect(data.get("matchId")).toBe(CONTEXT.matchId);
    // 动态字段靠 JSON 隐藏字段交给服务端
    expect(data.get("speakerScoresJson")).toBeTypeOf("string");
    expect(data.get("otherValuesJson")).toBeTypeOf("string");
  });

  it("胜方是带 name 的 radio group（原来那个 select 漏了 name，胜方从来没被提交）", () => {
    render(<BallotForm context={CONTEXT} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio).toHaveAttribute("name", "winnerTeamId");
    }
  });

  it("选中的胜方会真的出现在提交数据里", () => {
    const { container } = render(<BallotForm context={CONTEXT} />);
    fireEvent.click(screen.getByRole("radio", { name: "队伍 2" }));
    expect(new FormData(formElement(container)).get("winnerTeamId")).toBe(
      "22222222-0000-0000-0000-000000000002",
    );
  });

  it("判决理由会真的出现在提交数据里", () => {
    const { container } = render(<BallotForm context={CONTEXT} />);
    fireEvent.change(screen.getByLabelText("Reason for decision"), {
      target: { value: "我方在交锋上占优。" },
    });
    expect(new FormData(formElement(container)).get("reasonForDecision")).toBe(
      "我方在交锋上占优。",
    );
  });

  it("已保存的胜方与理由会回填（重新打开不会丢）", () => {
    const { container } = render(
      <BallotForm
        context={{
          ...CONTEXT,
          winnerTeamId: "22222222-0000-0000-0000-000000000001",
          reasonForDecision: "上次写了一半",
        }}
      />,
    );
    expect(screen.getByRole("radio", { name: "队伍 1" })).toBeChecked();
    const data = new FormData(formElement(container));
    expect(data.get("winnerTeamId")).toBe("22222222-0000-0000-0000-000000000001");
    expect(data.get("reasonForDecision")).toBe("上次写了一半");
  });
});

describe("提交前的一步确认（规范 §9.3：Submission dialog）", () => {
  it("点「提交评分表」不会立刻提交，而是先给出摘要", () => {
    render(<BallotForm context={CONTEXT} />);
    expect(screen.queryByRole("heading", { name: "Submit this ballot?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Submit ballot" }));
    expect(screen.getByRole("heading", { name: "Submit this ballot?" })).toBeInTheDocument();
  });

  it("摘要里列出还缺的必填项（裁判不用提交一次才知道缺什么）", () => {
    render(<BallotForm context={CONTEXT} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit ballot" }));
    // 空表：胜方、判决理由、张三的内容 都还没填
    expect(screen.getByRole("alert")).toHaveTextContent("required items are still missing");
    expect(screen.getByText("张三 · Content")).toBeInTheDocument();
  });

  it("填齐之后摘要说「都填齐了」，并提醒提交后不能直接改", () => {
    render(
      <BallotForm
        context={{
          ...CONTEXT,
          winnerTeamId: "22222222-0000-0000-0000-000000000001",
          reasonForDecision: "我方在交锋上占优。",
          data: {
            speakerValues: { "eeeeeeee-0000-0000-0000-000000000004": { content: 27 } },
            teamValues: {},
            matchValues: {},
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit ballot" }));
    expect(screen.getByText("Everything required looks filled in.")).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited/)).toBeInTheDocument();
    /**
     * ⚠️ 这里必须是**确认按钮自己的名字**（"Confirm and submit"），
     * 而不是 "Submit ballot" —— 后者是打开确认区的那个按钮。
     * 两者同名时这条断言会匹配到触发按钮，于是**即使确认按钮没渲染也会通过**。
     */
    expect(screen.getByRole("button", { name: "Confirm and submit" })).toBeInTheDocument();
  });

  it("「返回检查」可以退回去继续改", () => {
    render(<BallotForm context={CONTEXT} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit ballot" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the ballot" }));
    expect(screen.queryByRole("heading", { name: "Submit this ballot?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Submit ballot" })).toBeInTheDocument();
  });
});

describe("已提交的评分表是只读的", () => {
  it("提交之后不再显示输入控件与提交按钮，只说明怎么更正", () => {
    render(
      <BallotForm
        context={{
          ...CONTEXT,
          ballotStatus: "submitted",
          winnerTeamId: "22222222-0000-0000-0000-000000000001",
          reasonForDecision: "已提交的理由",
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Submit ballot" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.getByRole("radio", { name: "队伍 1" })).toBeDisabled();
    expect(screen.getByText(/ask an administrator to reopen/)).toBeInTheDocument();
  });

  /**
   * 规范 §9.3："immutable submitted view with timestamp and reference ID"。
   * 裁判报问题时要把编号抄给管理员，因此它必须显示出来、而且是等宽的。
   */
  it("只读视图给出**提交时间**与**评分表编号**", () => {
    render(
      <BallotForm
        context={{
          ...CONTEXT,
          ballotId: "bb000000-0000-0000-0000-000000000002",
          ballotStatus: "submitted",
          submittedAt: "2026-10-20T11:30:00.000Z",
        }}
      />,
    );
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText(/2026-10-20 19:30/)).toBeInTheDocument();
    expect(screen.getByText("Ballot ID")).toBeInTheDocument();
    expect(screen.getByText("bb000000-0000-0000-0000-000000000002")).toBeInTheDocument();
  });
});
