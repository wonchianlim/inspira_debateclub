import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BallotDocument } from "@/components/domain/ballot-document";
import type { StudentBallot } from "@/lib/student/ballots";

/**
 * 一份评分表的可读版面（规范 §8.7）。
 *
 * 规范原文："Use readable document layout, **not a dense form after submission**.
 * Preserve line breaks. Print view must be clean and omit navigation."
 *
 * 这里断言的是**结构**：分数是分数、裁判写的话是裁判写的话，
 * 而且"做得好的地方"与"应该改进的地方"必须分开 ——
 * 原来它们只是两行 `label：value`，读起来像同一段话的两句。
 */

const BALLOT: StudentBallot = {
  ballotId: "b1",
  matchId: "m1",
  matchNumber: 3,
  roomName: "A101",
  scheduledStart: "2026-10-20T10:00:00.000Z",
  formatCode: "PF",
  templateName: "公共论坛式辩论（PF）",
  // schema 在本组件里用不到（分数/反馈都已拍平成下面的数组），给一个最小形状
  schema: { fields: [], totals: [] } as unknown as StudentBallot["schema"],
  myTeamId: "team-1",
  myTeamLabel: "队伍 17",
  myScores: [
    { key: "content", label: "内容", value: 27 },
    { key: "style", label: "表达", value: 26 },
  ],
  myTotals: [{ key: "speaker_points", label: "个人总分", value: 27, max: 30 }],
  teamTotals: [{ key: "team_total", label: "队伍总分", value: 53, max: 60 }],
  matchScores: [{ key: "judge_confidence", label: "裁判信心", value: 2, optionLabel: "势均力敌" }],
  sideTotals: [
    { teamId: "team-1", label: "队伍 17", total: 53 },
    { teamId: "team-2", label: "队伍 04", total: 50 },
  ],
  winnerTeamId: "team-1",
  outcome: "win",
  myRank: null,
  ranking: null,
  teamFeedback: [
    {
      key: "feedback_strength",
      label: "做得好的地方",
      value: "第一段论证清晰。\n第二段举证充分。",
    },
    { key: "feedback_improve", label: "应该改进的地方", value: "结尾要收拢。" },
  ],
  matchText: [
    {
      key: "reason_for_decision",
      label: "判决理由",
      value: "我方在交锋上占优。\n对方的时间分配有问题。",
    },
  ],
  matchLists: [{ key: "clash", label: "交锋", entries: ["定义之争", "举证责任"] }],
  teamLists: [{ key: "arguments", label: "论点", entries: ["公共论坛应设门槛"] }],
  reviewStatus: null,
  judgeName: "虚构裁判丁",
};

describe("这一场是什么", () => {
  it("场次与房间是标题", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByRole("heading", { name: "第 3 场 · A101" })).toBeInTheDocument();
  });

  it("结果放在最上面（学生最先想知道的就是赢没赢）", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("胜")).toBeInTheDocument();
  });

  it("BP 这类没有胜负的赛制显示名次", () => {
    const { container } = render(
      <BallotDocument ballot={{ ...BALLOT, outcome: null, myRank: 2 }} anonymousLabel={null} />,
    );
    expect(within(container).getByText("第 2 名")).toBeInTheDocument();
  });

  it("显示赛制与模板名", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("PF")).toBeInTheDocument();
    expect(screen.getByText(/公共论坛式辩论（PF）/)).toBeInTheDocument();
  });

  /**
   * 2026-10-01 产品负责人决定：向学生公开本场裁判是谁。
   * 姓名来自 `my_published_ballot_judges()`（只返回姓名，不返回档案行里的邮箱/电话）。
   */
  it("显示本场裁判的姓名", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("裁判：虚构裁判丁")).toBeInTheDocument();
  });

  it("拿不到姓名时退回匿名序号 —— 而不是显示空白或编一个名字", () => {
    render(<BallotDocument ballot={{ ...BALLOT, judgeName: null }} anonymousLabel="裁判 2" />);
    expect(screen.getByText("裁判 2")).toBeInTheDocument();
  });
});

describe("分数用模板里的标签", () => {
  it("逐项分与总项都在，总项带满分", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("内容")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText("27 / 30")).toBeInTheDocument();
  });

  /**
   * ⚠️ 规范 §8.7："Score breakdown using the exact ballot template labels"。
   * 「裁判信心」是 1–3 档，光给一个 2 学生不知道是什么意思 ——
   * 必须带上模板里那一档的说明。这个字段原来**完全没有**出现在学生端。
   */
  it("按档位打分的整场项带上模板原话（2 →「势均力敌」）", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("裁判信心")).toBeInTheDocument();
    expect(screen.getByText("势均力敌（2）")).toBeInTheDocument();
  });

  it("两队总分列出，并标出我方", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("53")).toBeInTheDocument();
    expect(screen.getByText("（我方）")).toBeInTheDocument();
  });
});

describe("裁判给我们的反馈：做得好的 / 应该改进的必须分开", () => {
  it("两节各有标题", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByRole("heading", { name: "做得好的地方" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "应该改进的地方" })).toBeInTheDocument();
  });

  it("反馈文字保留换行（规范明确要求 preserve line breaks）", () => {
    const { container } = render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    const paragraph = [...container.querySelectorAll("p")].find((node) =>
      node.textContent?.includes("第一段论证清晰"),
    );
    expect(paragraph).toBeDefined();
    expect(paragraph?.className).toContain("whitespace-pre-wrap");
  });
});

describe("判决理由与列表", () => {
  it("判决理由作为整场说明呈现，并保留换行", () => {
    const { container } = render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("判决理由")).toBeInTheDocument();
    const paragraph = [...container.querySelectorAll("p")].find((node) =>
      node.textContent?.includes("我方在交锋上占优"),
    );
    expect(paragraph?.className).toContain("whitespace-pre-wrap");
  });

  it("交锋与论点用列表", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.getByText("定义之争")).toBeInTheDocument();
    expect(screen.getByText("公共论坛应设门槛")).toBeInTheDocument();
  });
});

describe("打印与复核", () => {
  /**
   * ⚠️ 复核请求是**动作**。规范要求打印视图干净：
   * 纸面上不该出现一个"提交复核请求"的按钮。
   */
  it("复核表单带 print:hidden —— 打印时不会出现在纸面上", () => {
    const { container } = render(
      <BallotDocument
        ballot={BALLOT}
        anonymousLabel={null}
        reviewSlot={<button type="submit">提交复核请求</button>}
      />,
    );
    const slot = container.querySelector(".print\\:hidden");
    expect(slot).not.toBeNull();
    expect(slot?.textContent).toContain("提交复核请求");
  });

  it("分数与裁判写的字**不能**被 print:hidden 藏起来（那是内容）", () => {
    const { container } = render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    const hidden = container.querySelectorAll(".print\\:hidden");
    expect(hidden).toHaveLength(0);
  });

  it("没有复核表单时不会渲染那一块", () => {
    render(<BallotDocument ballot={BALLOT} anonymousLabel={null} />);
    expect(screen.queryByText("提交复核请求")).toBeNull();
  });
});

describe("空内容不渲染成空标题", () => {
  it("没有分数、没有反馈、没有理由时不出现空小节", () => {
    const empty: StudentBallot = {
      ...BALLOT,
      myScores: [],
      myTotals: [],
      matchScores: [],
      sideTotals: [
        { teamId: "team-1", label: "队伍 17", total: null },
        { teamId: "team-2", label: "队伍 04", total: null },
      ],
      teamFeedback: [],
      matchText: [],
      matchLists: [],
      teamLists: [],
    };
    render(<BallotDocument ballot={empty} anonymousLabel={null} />);
    expect(screen.queryByText("我的分数")).toBeNull();
    expect(screen.queryByText("两队总分")).toBeNull();
    expect(screen.queryByText("交锋与论点")).toBeNull();
    // 场次本身仍然要在
    expect(screen.getByRole("heading", { name: "第 3 场 · A101" })).toBeInTheDocument();
  });
});
