# Phase 6 实施计划 — 签到与现场看板

- 制定日期：2026-09-29
- 依据：主规格第 15 节 Phase 6、**第 2.8 节（Check-in and room state）**、第 17 节
- 前置：Phase 1–5 已完成
- **费用：本阶段全部在本机完成，0 元**

---

## 1. Phase 6 要做什么（规范原文）

> - Student/admin check-in and judge readiness.
> - Live status calculations, warning/critical timing, counts, overdue start.
> - Start Debate transaction and roster snapshots.
> - Accessible manual move/ironman/emergency workflows before start.

**其中后两项在 Phase 5 已经完成**：`start_match()`（原子锁定名单）、
`move_team_member()`、`set_ironman()`、`emergency_correct_roster()`。
因此本阶段的新工作是**前两项**。

---

## 2. 规范给定的规则（第 2.8 节，逐条对应实现）

```text
Check-in opens 30 minutes before the event.
Students use a simple Check In action; staff can check them in manually.
At the warning time (normally 7:20 PM), missing participants or judges are flagged.
At start time, unresolved rooms become critical.

Operational colors are presentation only; the database stores semantic states:
  neutral:  scheduled, before warning;
  warning:  someone missing after warning time;
  ready:    all required participants and a judge are present;
  live:     judge selected Start Debate;
  complete: ballot submitted/published;
  cancelled: match cancelled.
```

**两条必须照做的细节：**

1. **颜色只是展示层**，数据库存的是**语义状态**。因此领域层输出的是那六个语义值，
   不输出任何颜色或样式。
2. **第 17 节**："Compute late cancellation, warning, and overdue behavior from
   **timestamps**, not browser-local assumptions." → 领域层**只接受时间戳**，
   "现在"必须由调用方传入，测试才能覆盖边界。

---

## 3. 步骤

### P6-1 现场状态的纯逻辑层 ✅ 已完成

`lib/domain/live-status.ts` + 31 条测试：六个语义状态、
warning/ready 的判定顺序、30 分钟签到窗口、超时判定、汇总计数、紧急程度。

### P6-2 签到动作 ✅ 已完成

学生自助签到、管理员代签、裁判签到。用**不同的 `check_in_method`** 值
（`self` / `admin`）记录，事后能分清"学生自己签的"与"管理员代签的"。

### P6-3 现场看板 ✅ 已完成

`/manage/events/[eventId]/live`：汇总计数、每场的现场状态、缺人名单、
超时未开始提醒，并可直接代学生签到。

### P6-4 比赛设置可配置 ✅ 已完成（**产品负责人明确要求**）

Phase 5 完成报告里的 **L-7**：比赛的时间与房间当时是写死的保守默认值
（房间从 `A101`、时间从"三天后"、每场隔 60 分钟）。

**产品负责人已明确要求："希望比赛时间和房间能自己设置"。**

因此新增活动级配置：
- `events.match_start_at`：第一场比赛从几点开始（**为空 = 沿用活动开始时间**，即旧行为）；
- `events.match_interval_minutes`：每场间隔（默认 60，与旧行为一致）；
- `events.room_names`：可用房间列表（**为空 = 退回 A101 起的默认**）。

默认值刻意保持"和以前完全一样"，这样已有活动的生成结果不会因为这次改动而悄悄变化。

### P6-5 测试、文档与完成报告 ⬜ 待做

---

## 4. 需要产品负责人输入的事项

| # | 事项 | 状态 |
|---|---|---|
| O-1 | **五种赛制的评分表字段与分数区间** | ❌ 仍缺 —— **阻塞 Phase 7** |
| O-7 | 是否需要"同校回避"等裁判回避规则 | 规范默认**不许我自己加** |
| ~~O-8~~ | ~~比赛时间与房间是否可配置~~ | ✅ **已确认要做，P6-4 已完成** |

---

## 5. 本阶段的完成定义

- `npm run ci` 与 `npm run db:verify` 均退出码 0；
- 六个语义状态与规范的六条**逐条对应**，边界（恰好警告时刻、恰好 30 分钟、
  恰好开始时间）都有测试；
- "颜色只是展示层"体现在代码结构上：领域层不输出颜色；
- "现在"由调用方传入，领域层不自己取时间；
- 签到动作的**端到端验证**（学生自助 / 管理员代签 / 裁判签到各一条）；
- 完成报告含真实命令结果。
