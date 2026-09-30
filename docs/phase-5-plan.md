# Phase 5 实施计划 — 比赛、房间、正反方与裁判指派

- 制定日期：2026-09-29
- 依据：主规格第 15 节 Phase 5、**第 10.4–10.7 节**、**第 11 节（裁判指派）**、第 6.4/6.5 节
- 前置：Phase 1–4 已完成
- **费用：本阶段全部在本机完成，0 元**

---

## 1. Phase 5 要做什么（规范原文）

> - Match proposal and side-balancing logic.
> - Separate format operations pages.
> - Rooms/meeting links and assignment publication.
> - Judge availability, approval, recommendation, confirmation, replacement.

---

## 2. 规范给定的、**不能自己发明**的三个公式与规则

### 2.1 比赛成本（10.4）

```text
match_cost =
    12 * average_rating_spread
    +  8 * repeat_opponent_count
    +  3 * repeated_judge_exposure_estimate
    +  2 * side_imbalance_after_assignment
```

规范补充：**"For BP, compare both overall room spread and adjacent team
strength; do not reduce four-team placement to a binary winner model."**

### 2.2 正反方分配（10.5）

PF/JWSD/WSDC/1v1 用 `PROP`/`OPP`；BP 用 `OG`/`OO`/`CG`/`CO`。
选"让每位学生的历史不平衡最小"的方案，**并列时用基于活动 ID 与队伍 ID 的种子哈希打破**，
使相同输入重跑得到相同结果。

### 2.3 裁判成本（§11）

```text
judge_cost =
    10 * total_times_judged_any_student_in_match
    +  6 * recent_times_judged_any_student_in_match
    +  3 * workload_count_for_event
```

**规范明文限制：** "In V1, only repeated judging is a requested conflict rule.
**Do not invent school/coach conflicts without product-owner confirmation**, but
design the function so additional conflict rules can be added later."

→ **我不会自己加"同校回避""教练回避"这类规则。** 只实现"重复执裁"一条，
但把接口留出扩展位。

### 2.4 裁判候选的资格条件（§11）

必须是：**已批准**、**该活动可用**、**该赛制有资格**、
（现场指派时）**已签到**、且**没有被指派到时间冲突的另一场比赛**。

---

## 3. 不在本阶段范围内

- ❌ 签到与现场看板 → Phase 6（本阶段只用签到状态判断裁判可用性）
- ❌ 评分表内容 → Phase 7（**被 O-1 阻塞**）
- ❌ 邮件通知 → Phase 9

---

## 4. 步骤

### P5-1 六张表与四个枚举 ✅ 已完成（2026-09-29）

> **落地文件：** 迁移 `20260929092100_matches_and_judges.sql`
> （6 张表、4 个枚举、3 个跨行触发器函数、RLS、审计触发器）。
>
> **实际结果：** 八项检查全部退出码 0；527 条测试通过；`db:verify` 退出码 0，
> 数据库用例**从 161 条增加到 175 条**（授权 84 + 约束 33 + 匿名 27 + 限流 9 + 审计 13 + 报名窗口 9）。
> 全库：**27 张表 / 61 条策略 / 15 个枚举 / 24 个审计触发器**。
>
> **三条不显眼但很关键的约束，都实测验证过：**
>
> | 约束 | 为什么重要 | 验证 |
> |---|---|---|
> | 同一活动内**房间名唯一** | 重复会让现场两支队伍走错场地，而且很难事后发现 | `C30` ✅ |
> | 名单快照**只增不改** | 规范第 17 节：绝不让事后的档案/队伍/评分改动重写已完成的辩论 | `C31`、`C32` ✅ |
> | 同一裁判**不能**被指派到时间冲突的两场比赛 | 规范第 6.5 节末句明文要求 | `C33` ✅ |
>
> **名单快照用两道防线**（与 `audit_logs` 同一套做法）：
> 撤销 `UPDATE`/`DELETE`/`TRUNCATE` 权限，**再加**触发器兜底。
> 只靠权限，将来某次迁移不小心重新 `GRANT` 就会失守；只靠触发器，错误信息不如权限拒绝直白。
> 实测：`authenticated` 与 `service_role` 都只有 `INSERT`/`SELECT`。
>
> **正反方刻意不用数据库枚举**（规范第 6.4 节明文："Do not use one rigid database
> enum for format-specific positions"）。只约束"非空"与"同一场比赛内位置不重复"，
> 具体取值由领域逻辑按赛制校验（PF 用 PROP/OPP，BP 用 OG/OO/CG/CO）。
>
> **"时间冲突"的定义如实写明：** 规范没给比赛时长，因此这里把
> "同一活动内 `scheduled_start` 相同的两场比赛"视为冲突，**不擅自假设时长** ——
> 这已经能挡住最常见的错误（把同一位裁判同时排到两场）。
>
> ---
>
> ### ⚠️ 两个测试写法问题（都是"测错东西"这一类）
>
> **1. `F-JDG-01` 第一次失败了，但问题在测试数据而不在策略。**
>
> 原来那位"裁判"其实就是**教练**，而 `is_staff()` **包含 coach** ——
> 他以"教练（staff）"身份合法地读到了名单，于是"裁判读不到未指派比赛的名单"这条用例失败。
> 已新增一位**纯裁判**（只有 `judge` 角色）专门用于这条用例。
>
> **教训：测试数据里"一个人兼多个角色"会让用例测到别的角色，从而测错东西。**
>
> **2. 清理时被"只增不改"触发器挡住。**
>
> 这**正是它该做的**。测试收尾必须删掉虚构数据，因此在清理处以超级管理员身份
> **临时停用**该触发器、删完立刻恢复，并在脚本里写明：
> 这不是安全漏洞 —— `db-tests.sql` 本就以 postgres 超级用户运行，
> 而应用**从不**以超级用户连接数据库，生产路径上没有任何可以停用它的入口。
>
> ### 顺带把三条挂在"待覆盖"里的原始用例补上了
>
> `F-JDG-01`（裁判读未被指派比赛的名单）、`F-ALL-03`（直接插入名单快照）、
> `F-MGR-03`（修改已开始比赛的名单快照 → 由 `C31` 覆盖）。

`matches`、`match_teams`、`match_roster_snapshots`、`match_motions`、
`judge_event_availability`、`judge_assignments`。

**要点：**
- `matches` 的 `UNIQUE (event_id, room_name)` —— **同一活动内房间不能重复**，
  这条约束比看起来重要：重复房间会让现场两队走错场地；
- **正反方不用数据库枚举**（规范明文要求），由领域逻辑按赛制校验；
- `match_roster_snapshots` **只增不改**：撤销 UPDATE/DELETE/TRUNCATE 权限
  （与 `audit_logs` 同一套做法）；
- **一个裁判不能被指派到时间冲突的两场比赛** —— 跨行、依赖时间的约束，
  用触发器强制（规范 §6.5 末句明文要求）。

### P5-2 成本函数与种子哈希（纯函数）

- `match_cost`（10.4），**每个权重单独测试**（沿用 P4-2 的做法）；
- **BP 的四队比较**：规范明确要求不能简化成"二元胜负"，
  因此需要"整体房间跨度"与"相邻队伍强度"两个量，而不是只算一个极差；
- `side_imbalance_after_assignment`；
- **种子哈希**：基于活动 ID + 队伍 ID 的确定性哈希，用于打破并列。

### P5-3 比赛生成

按 `teams_per_match` 组队成场；避免重复对手；分配正反方；分配房间与时间。

### P5-4 裁判候选排序与指派

`judge_cost` 排序；推荐界面展示**资格、重复执裁次数、工作量与警告**；
管理员确认。裁判取消后用同一套排序生成替代人选。

### P5-5 名单快照锁定与 Ironman

- 规范 10.7 第 4 条："**Starting a match permanently locks its roster
  snapshot.**" 开始比赛时**原子地**写入快照；
- 开始之后修改名单必须走**专门的、被审计的紧急更正流程**，绝不随意改快照；
- Ironman（10.6）：明确的管理员确认例外，队伍成员与比赛都要标记，
  且**不能被意外地重复计算演讲分**。

### P5-6 分赛制操作页与发布

按赛制分别展示比赛、房间、正反方、裁判；发布分配。

### P5-7 补上 Phase 4 的缺口：逐人移动队员

Phase 4 完成报告的 **L-5**：规范 10.7 第 1 条要求"管理员总能编辑提案"，
但当时只能锁定/解散/重新生成，**不能把某位同学从 A 队挪到 B 队**。
本步补上，并保证每次移动**都写审计**。

### P5-8 测试、文档与完成报告

---

## 5. 需要产品负责人输入的事项

| # | 事项 | 是否阻塞 |
|---|---|---|
| O-1 | 五种赛制的评分表字段与分数区间 | 不阻塞 Phase 5，**阻塞 Phase 7** |
| — | 是否需要"同校回避""教练回避"等裁判回避规则 | **不阻塞** —— 规范明文说 V1 只有"重复执裁"一条规则，且**不许我自己发明**。若你需要更多规则，请告诉我 |

**除上述之外，本阶段不需要新的产品决策。**

---

## 6. 本阶段的完成定义

- `npm run ci` 与 `npm run db:verify` 均退出码 0；
- `match_cost` 与 `judge_cost` 的**每个权重**都有独立测试；
- **正反方分配的确定性**有测试证明（相同输入重跑结果一致，含并列情形）；
- **名单快照的只增不改**有数据库层的拒绝用例；
- **一个裁判不能同时被指派到两场时间冲突的比赛**有拒绝用例；
- 规范 10.8 列举的场景逐条覆盖（五种赛制、奇数人数、重复对手、正反方平衡、ironman、确定性重跑）；
- 完成报告含真实命令结果。
