# Phase 7 实施计划 — 评分表

- 制定日期：2026-09-29
- 依据：主规格第 15 节 Phase 7、**第 6.6 节**（评分表表结构与 schema）、第 14.3 节
- 前置：Phase 1–6 已完成
- **费用：本阶段全部在本机完成，0 元**

---

## 1. Phase 7 要做什么（规范原文）

> - Versioned templates for PF, JWSD, WSDC, BP, and 1v1.
> - Draft save, format validation, submission, manager review.
> - Reopen/resubmit/audit and publish workflow.
> - Overdue ballot email/flags.

---

## 2. ⚠️ 一个**关键发现**：规范的设计让 O-1 不再阻塞大部分工作

我原本以为 Phase 7 会被"五种赛制的评分项与分数区间"（O-1）完全卡住。读了规范第 6.6 节之后发现**不是**：

> "Do **not** create five unrelated ballot systems. Use shared tables plus a
> **versioned format-specific schema**."
>
> "The JSON schema describes format-specific fields and required validation.
> It is **configuration**, not a dumping ground for all ballot data."

也就是说，规范要求把评分表差异做成**配置（JSON schema）**，而不是写进代码。
因此：

| 工作 | 是否需要 O-1 |
|---|---|
| 五张共享表与两个枚举 | ❌ 不需要 |
| schema 的形状设计与**通用校验器** | ❌ 不需要 |
| 草稿保存 / 校验 / 提交 / 复核 / 重开 / 发布流程 | ❌ 不需要 |
| 超时未交提醒 | ❌ 不需要 |
| **五种赛制具体的评分项与分数区间** | ✅ **需要** —— 但它是**数据**，由产品负责人配置成模板 |

**结论：只有"填空"需要 O-1，管道不需要。**

---

## 3. ⚠️ 一处**我做的设计决定**（规范没规定，可推翻）

规范说了"用版本化的 JSON schema 描述字段与校验"，但**没有规定这个 schema 的形状**。
我设计如下（写在 `lib/domain/ballot-schema.ts` 文件头，并标注可推翻）：

```json
{
  "schemaVersion": 1,
  "fields": [
    { "key": "content", "label": "内容", "type": "score",
      "scope": "speaker", "required": true, "min": 0, "max": 40 }
  ],
  "winnerRequired": true,
  "reasonForDecisionRequired": true
}
```

`scope` 决定值存在哪里，对应规范给的三张表：

| scope | 存到哪 |
|---|---|
| `speaker` | `ballot_scores`（按学生逐项打分） |
| `team` | `ballots.format_data`（按队伍一个值） |
| `match` | `ballots.format_data`（整场一个值） |

**最重要的一条：分数字段必须由配置的人给出 `min`/`max`。**
规范里 `score_value` 是 NUMERIC、没有规定区间；我不能替产品负责人决定"满分是 30 还是 100"。
因此模板校验会**明确拒绝**没有区间的分数字段，并说明"这是各赛制的评分区间，不能由系统替你决定"。

规范里提到的 "WSDC content/style/strategy/total、PF speaker_points、BP speaker_score"
只是**举例**，不是穷举，也不是唯一正确的答案。

---

## 4. 步骤

### P7-1 评分表表结构 ✅ 已完成

五张表（`ballot_templates` / `ballots` / `ballot_scores` / `ballot_feedback` /
`ballot_review_requests`）、两个枚举、RLS、审计。

**规范第 14.3 节点名的两条拒绝要求已覆盖：**
- "students cannot read **unpublished** ballots" → `F-STU-40`、`F-STU-41` ✅
- "judges cannot access **unassigned** matches/ballots" → `F-JDG-02` ✅

另加：评语目标必须在本场（规范第 6.6 节末句）→ `C34` ✅

### P7-2 schema 形状与通用校验器 ✅ 已完成

`lib/domain/ballot-schema.ts` + 26 条测试：模板自校验、按模板校验数据、
合法区间、**漏打检测**、能否提交。

### P7-3 模板管理界面（超管） ⬜ 待做

让超级管理员为五种赛制各配置一个模板（**这就是 O-1 的落地方式**）。

### P7-4 裁判填表流程 ⬜ 待做

草稿保存、按模板校验、提交。

### P7-5 管理员复核 / 重开 / 重交 / 发布 ⬜ 待做

规范第 15 节明文要求"reopen/resubmit/**audit** and publish workflow"。

### P7-6 学生查看已发布评分表 + 复核请求 ⬜ 待做

### P7-7 超时未交提醒与标记 ⬜ 待做

### P7-8 测试、文档与完成报告 ⬜ 待做

---

## 5. 需要产品负责人输入的事项

| # | 事项 | 状态 |
|---|---|---|
| **O-1** | **五种赛制各自的评分项与分数区间** | ⏳ **不再阻塞管道** —— 但**不填就没人能打分**。P7-3 做完后你可以直接在界面上配置，或者告诉我由我写成种子数据 |
| O-7 | 是否需要"同校回避"等裁判回避规则 | 规范默认**不许我自己加** |

**O-1 现在有两种交付方式：**
1. **你告诉我**五种赛制各有哪些评分项、分数范围是多少，我写成初始模板；
2. **你自己在界面上配置**（P7-3 做完之后）—— 适合你想自己调整的情况。

**我不会替你编。** 评分项错了会让整个比赛的评分不可信。

---

## 6. 本阶段的完成定义

- `npm run ci` 与 `npm run db:verify` 均退出码 0；
- 规范第 14.3 节点名的评分表相关拒绝用例**逐条**覆盖；
- 状态机（`draft → submitted → reopened → resubmitted → published`）的
  **每一次转换**都有测试，且**重开/重交/发布都被审计**；
- 一位裁判在一场比赛里只能有一份评分表（数据库唯一约束）；
- **未发布的评分表学生读不到**（数据库层，不是界面隐藏）；
- 完成报告含真实命令结果。
