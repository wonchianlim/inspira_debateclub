// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BALLOT_STATUSES,
  BALLOT_STATUS_TEXT,
  BALLOT_TRANSITIONS,
  availableBallotActions,
  checkBallotTransition,
  findBallotTransition,
  isBallotSubmittedForDashboard,
  isBallotVisibleToStudents,
} from "@/lib/domain/ballot-lifecycle";

/**
 * 评分表状态机（规范第 6.6、15 节）。
 *
 * 规范要求"reopen/resubmit/**audit** and publish workflow"，
 * 因此这里逐条固定住每一种转换的**方向与角色** ——
 * 尤其是"谁能做"：重开与发布只有管理员能做。
 */

describe("状态集合与数据库枚举一致", () => {
  it("五个状态与规范第 6.6 节列出的一致", () => {
    expect([...BALLOT_STATUSES]).toEqual([
      "draft",
      "submitted",
      "reopened",
      "resubmitted",
      "published",
    ]);
  });

  it("每个状态都有中文名称（界面上不能出现英文枚举）", () => {
    for (const status of BALLOT_STATUSES) {
      expect(BALLOT_STATUS_TEXT[status]).toBeTruthy();
    }
  });
});

describe("合法的转换", () => {
  it("裁判：草稿 → 已提交", () => {
    expect(findBallotTransition("draft", "submitted", "judge")).not.toBeNull();
  });

  it("裁判：已重开 → 已重新提交", () => {
    expect(findBallotTransition("reopened", "resubmitted", "judge")).not.toBeNull();
  });

  it("管理员：已提交 → 已重开，以及已重新提交 → 已重开", () => {
    expect(findBallotTransition("submitted", "reopened", "manager")).not.toBeNull();
    expect(findBallotTransition("resubmitted", "reopened", "manager")).not.toBeNull();
  });

  it("管理员：已提交 / 已重新提交 → 已发布", () => {
    expect(findBallotTransition("submitted", "published", "manager")).not.toBeNull();
    expect(findBallotTransition("resubmitted", "published", "manager")).not.toBeNull();
  });
});

describe("⚠️ 谁可以做：重开与发布只有管理员能做", () => {
  it("裁判**不能**自己重开", () => {
    const result = checkBallotTransition("submitted", "reopened", "judge");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toContain("只有管理员");
  });

  it("裁判**不能**自己发布", () => {
    const result = checkBallotTransition("submitted", "published", "judge");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toContain("只有管理员");
  });

  it("管理员**不能**替裁判提交", () => {
    const result = checkBallotTransition("draft", "submitted", "manager");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toContain("只有负责本场的裁判");
  });

  it('管理员**不能**替裁判重新提交 —— 否则"重开"就没有意义了', () => {
    const result = checkBallotTransition("reopened", "resubmitted", "manager");
    expect(result.allowed).toBe(false);
  });
});

describe('published 是终态（规范没有给出"取消发布"）', () => {
  it("已发布之后没有任何出边", () => {
    const outgoing = BALLOT_TRANSITIONS.filter((transition) => transition.from === "published");
    expect(outgoing).toHaveLength(0);
  });

  it("任何从已发布出发的转换都被拒绝，并说明可以走重开", () => {
    for (const to of BALLOT_STATUSES) {
      const result = checkBallotTransition("published", to, "manager");
      expect(result.allowed, `published → ${to} 不应被允许`).toBe(false);
    }
    const result = checkBallotTransition("published", "reopened", "manager");
    if (!result.allowed) expect(result.message).toContain("重开");
  });
});

describe("不合法的转换给出**可直接显示**的中文原因", () => {
  it("草稿不能重开 —— 裁判自己还能继续填", () => {
    const result = checkBallotTransition("draft", "reopened", "manager");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toContain("草稿");
  });

  it("草稿不能直接发布", () => {
    const result = checkBallotTransition("draft", "published", "manager");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toContain("还没有提交");
  });

  it("已重开（等裁判重交）时不能发布", () => {
    const result = checkBallotTransition("reopened", "published", "manager");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.message).toContain("等裁判重新提交");
  });

  it("已发布不能回到草稿", () => {
    const result = checkBallotTransition("published", "draft", "manager");
    expect(result.allowed).toBe(false);
  });

  it("失败信息里不出现英文枚举名（界面要能直接显示）", () => {
    const cases = [
      ["draft", "reopened"],
      ["draft", "published"],
      ["reopened", "published"],
      ["published", "draft"],
    ] as const;
    for (const [from, to] of cases) {
      const result = checkBallotTransition(from, to, "manager");
      if (!result.allowed) {
        expect(result.message).not.toContain("draft");
        expect(result.message).not.toContain("reopened");
        expect(result.message).not.toContain("published");
      }
    }
  });
});

describe("界面按角色显示可用动作", () => {
  it('裁判在草稿上只看到"提交"', () => {
    const actions = availableBallotActions("draft", "judge");
    expect(actions.map((action) => action.to)).toEqual(["submitted"]);
  });

  it("裁判在已提交上**看不到任何动作**（要改只能找管理员）", () => {
    expect(availableBallotActions("submitted", "judge")).toHaveLength(0);
  });

  it('管理员在已提交上看到"重开"与"发布"', () => {
    const targets = availableBallotActions("submitted", "manager").map((action) => action.to);
    expect(targets).toContain("reopened");
    expect(targets).toContain("published");
  });

  it("管理员在草稿上看不到任何动作", () => {
    expect(availableBallotActions("draft", "manager")).toHaveLength(0);
  });

  it("管理员在已重开上只能等（没有可用动作）", () => {
    expect(availableBallotActions("reopened", "manager")).toHaveLength(0);
  });
});

describe("学生可见性与看板统计", () => {
  it("只有已发布的评分表学生能看到（规范第 14.3 节）", () => {
    for (const status of BALLOT_STATUSES) {
      expect(isBallotVisibleToStudents(status)).toBe(status === "published");
    }
  });

  /**
   * `reopened` **不算**已交 —— 那正是它存在的意义。
   * 算成已交会让看板显示"全部交齐"而实际还差一份。
   */
  it('已重开不算"已交"', () => {
    expect(isBallotSubmittedForDashboard("reopened")).toBe(false);
    expect(isBallotSubmittedForDashboard("draft")).toBe(false);
    expect(isBallotSubmittedForDashboard("submitted")).toBe(true);
    expect(isBallotSubmittedForDashboard("resubmitted")).toBe(true);
    expect(isBallotSubmittedForDashboard("published")).toBe(true);
  });
});

/**
 * 跨层一致性（沿用 Phase 3 建立的做法）。
 *
 * 状态值同时写在 TypeScript 与数据库枚举里。数据库测试能发现
 * "数据库被改了"，但发现不了"只有 TypeScript 被改了"。
 * 因此这里**直接读迁移文件**比对 —— 与报名窗口那条测试同一个思路。
 */
describe("跨层一致性：TypeScript 的状态清单与数据库枚举一致", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260929092600_ballots.sql"),
    "utf8",
  );

  it("ballot_status 枚举包含全部五个状态，且不多不少", () => {
    const match = /create type public\.ballot_status as enum \(([\s\S]*?)\);/.exec(migration);
    expect(match, "迁移文件里没有找到 ballot_status 枚举").not.toBeNull();
    const values = (match?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(/^'|'$/g, ""))
      .filter((value) => value !== "");
    expect([...values].sort()).toEqual([...BALLOT_STATUSES].sort());
  });

  it("枚举里没有 TS 不认识的状态（否则状态机会漏掉一种情况）", () => {
    const match = /create type public\.ballot_status as enum \(([\s\S]*?)\);/.exec(migration);
    const values = (match?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(/^'|'$/g, ""))
      .filter((value) => value !== "");
    for (const value of values) {
      expect(BALLOT_STATUSES).toContain(value);
    }
  });
});

/**
 * 跨层一致性：数据库函数里的转换清单与 TypeScript 一致。
 *
 * 与"报名窗口"那套做法相同 —— 数据库测试能发现"数据库被改了"，
 * 但发现不了"只有 TypeScript 被改了"。因此直接读迁移文件比对。
 *
 * 不做这一步的后果很具体：界面会显示一个按下去必然失败的按钮，
 * 或者更糟 —— 一个本该被拒绝的转换在数据库层被放行。
 */
describe("跨层一致性：数据库函数的转换清单与 TypeScript 一致", () => {
  const workflow = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260929092700_ballot_workflow.sql"),
    "utf8",
  );

  /** 从 `(values ('a','b','actor'), ...)` 里解析出三元组。 */
  function parseSqlTransitions(): string[] {
    const match = /\(values([\s\S]*?)\) as allowed/.exec(workflow);
    expect(match, "迁移文件里没有找到转换清单").not.toBeNull();
    const body = match?.[1] ?? "";
    const tuples = [...body.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'([a-z]+)'\s*\)/g)];
    return tuples.map((tuple) => `${tuple[1]}|${tuple[2]}|${tuple[3]}`).sort();
  }

  it("两边的转换集合完全相同（不多不少）", () => {
    const fromSql = parseSqlTransitions();
    const fromTs = BALLOT_TRANSITIONS.map(
      (transition) => `${transition.from}|${transition.to}|${transition.actor}`,
    ).sort();
    expect(fromSql).toEqual(fromTs);
  });

  it("解析到了预期数量的转换（防止正则失效导致假通过）", () => {
    // 如果正则写坏了、解析出 0 条，上面的比对会因为两边都空而"通过"
    expect(parseSqlTransitions().length).toBe(BALLOT_TRANSITIONS.length);
    expect(parseSqlTransitions().length).toBeGreaterThan(0);
  });

  it("迁移文件里确实要求重开必须给理由", () => {
    expect(workflow).toContain("重开评分表必须填写理由");
  });

  it("迁移文件里的拒绝信息是中文（可直接显示给管理员）", () => {
    expect(workflow).toContain("只有负责本场的裁判可以提交评分表");
    expect(workflow).toContain("这份评分表还没有提交，不能发布");
  });
});
