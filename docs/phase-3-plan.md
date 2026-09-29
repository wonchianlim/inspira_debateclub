# Phase 3 实施计划 — 学生报名与偏好

- 制定日期：2026-09-29
- 依据：`INSPIRA_DEEPSEEK_MASTER_SPEC.md` 第 15 节 Phase 3、第 9.2 节、第 6.3 节
- 前置：Phase 1、Phase 2 已完成
- **费用：本阶段全部在本机完成，0 元**

---

## 1. Phase 3 要做什么（规范原文）

> **Phase 3 — Student registration and preferences**
> - Student event discovery, registration, format preferences, partner requests.
> - Deadline-aware cancellation and late-cancellation/no-show tracking.
> - Eligibility enforcement and confirmation notifications.
> - Manager registration view and manual corrections.

规范第 9.2 节的流程：

1. 管理员创建/克隆活动并启用赛制（Phase 2 已完成）；
2. 管理员开放报名，学生收到邮件/站内通知；
3. **学生报名一次，并给有资格的赛制排序**；
4. 学生可以请求搭档；
5. **截止前取消记为 `cancelled`；截止后取消记为 `late_cancelled`**；
6. **报名按时间戳自动关闭**，即使定时状态更新没有跑；
7. 管理员在配对前复核未解决的资格与偏好问题。

---

## 2. Phase 1/2 已经打好的地基

| 已存在 | 说明 |
|---|---|
| `registrations` 表 | 含 `UNIQUE(event_id, student_id)`，状态含 `cancelled` / `late_cancelled` / `no_show` |
| `registration_format_preferences` 表 | 含 `preference_rank` 唯一约束 |
| `student_format_profiles` | 资格（`eligible`）与评分（`rating`） |
| `is_event_registration_open(uuid)` | **按时间戳**判断报名是否开放，不依赖活动状态被手动推进（对应 9.2 第 6 条） |
| `is_format_selectable_for_registration(uuid,uuid)` | 该学生在该活动上能否选该赛制（同时检查"活动启用了"与"学生合格"） |
| RLS：`registrations_insert_own` / `update_own` / `select_own_or_staff` | 学生只能读写自己的报名 |
| **`partner_requests` 表** | ❌ **不存在，需要新增** |
| **`partner_request_status` 枚举** | ❌ **不存在，需要新增** |

---

## 3. 不在本阶段范围内

- ❌ 配对与队伍提案（Phase 4）
- ❌ 比赛、房间、裁判指派（Phase 5）
- ❌ 签到（Phase 6）—— 但 `checked_in_at` / `check_in_method` 字段已存在
- ❌ 评分表（Phase 7）
- ❌ **邮件实际投递**（Phase 9）—— 本阶段只做站内"报名确认"记录，不发邮件

---

## 4. 步骤

### P3-1 `partner_requests` 表、枚举与策略 ✅ 已完成（2026-09-29）

> **落地文件：** 迁移 `20260929091700_partner_requests.sql`。
>
> **实际结果：** `db:verify` 退出码 0；数据库用例**从 110 条增加到 119 条**
> （授权 62 + 约束 23 + 匿名 16 + 限流 9 + 审计 9），连跑两次结果一致。
> 八项 JS 检查全部退出码 0。
> 全库：**17 张表 / 41 条策略 / 54 个索引 / 7 个枚举 / 14 个审计触发器**。
>
> **"同一活动/赛制只有一条有效请求"用部分唯一索引实现**，只约束 `pending` / `accepted`。
> 若对所有状态建唯一，学生一旦被拒绝或撤回就**再也无法重新请求**。
>
> **一处不显眼但必需的写法：** 索引里用了 `COALESCE(format_id, 哨兵UUID)`。
> PostgreSQL 在唯一索引中把 **NULL 视为互不相等**，所以直接对可空的 `format_id` 建索引时，
> "没有指定赛制"的重复请求**根本拦不住**。用哨兵值把 NULL 归一化之后才真正生效。
>
> **⚠️ 一个重要的设计发现（会影响 P3-4 搭档请求界面）：**
> 学生**看不到**其他学生的 `student_profiles` 行 —— 这是 RLS 的正确行为（保护隐私）。
> 因此搭档请求界面**不能**让前端直接按 id 指定对方，必须有服务端的安全查询
> （例如"列出本活动的参与者"并只返回必要字段）。
>
> 这个问题是**写测试时踩出来的**，不是看代码看出来的：我最初的用例用子查询取
> "另一个学生"的 id，取到的是 NULL，插入便以"违反 RLS"的形式失败 ——
> 看起来像策略写错了，实际是测试写法不对。已把测试数据改为固定 id，
> 并把原因写进注释，避免以后有人照着错的写法再写一遍。P3-4 会按这个约束设计界面。
>
> **顺带把 `registrations` 与 `partner_requests` 加入审计触发器。**
> P2-2 曾刻意排除它们（理由："学生自助操作，不是特权改动"）。到 Phase 3，
> 这两张表的状态变化开始有**后果**：`late_cancelled`（迟取消）与 `no_show`（未到场）
> 会影响历史与信誉，`accepted`（已接受搭档）会影响配对 —— 都属于"事后需要解释清楚"的事。
> `registration_format_preferences` 仍然不审计：纯偏好、改动频繁、无直接后果，
> 且最终结果会在 Phase 4 的配对提案快照里保留。

**做什么：** 新增 `partner_request_status` 枚举与 `partner_requests` 表（规范第 6.3 节），包含
"不能请求自己"的 CHECK、RLS 策略，以及"同一请求人/活动/赛制最多一条有效请求"的保证。

**要点：** 规范说 "Enforce at most one active request for the same requester/event/format"。
`status` 有五种，其中 `pending`/`accepted` 属于"有效"。用**部分唯一索引**实现
（只对有效状态建唯一），而不是对所有状态建唯一 —— 否则一旦被拒绝或取消，学生就再也无法重新请求。

**验收标准：** 从空库重放成功；不能请求自己、不能对同一活动/赛制重复有效请求（有测试）；
学生只能看与自己相关的请求（作为请求方或接收方），管理员能看全部。

---

### P3-2 报名领域逻辑（纯函数，穷举测试）

**做什么：** 把"能不能报名 / 能不能取消 / 取消算什么状态 / 偏好排序是否合法"做成纯领域模块。

```text
报名窗口：now < registration_opens_at  → 尚未开放
          opens_at <= now < closes_at  → 开放中
          now >= closes_at             → 已关闭（对应 9.2 第 6 条：按时间戳自动关闭）
取消：    截止前 → cancelled        截止后 → late_cancelled
```

**为什么单独做：** 这是学生最容易踩坑、也最容易写错的地方。
做成纯函数后可以**穷举**边界（恰好等于开放时刻、恰好等于截止时刻）。

**验收标准：** 边界时刻（等于开放/截止的那一秒）有明确且一致的判定；
所有状态与时间组合穷举覆盖。

---

### P3-3 学生：活动详情、报名与赛制偏好

**做什么：** `/student/events`、`/student/events/[eventId]`，以及报名 / 取消 / 保存赛制偏好。

**要点：**
- 报名时展示**资格状态**：哪些赛制可选（已合格且活动已启用），哪些不可选及原因；
- 偏好排序用数字排名，保存时校验不重复；
- 界面上明确显示**报名截止时间**与"截止后取消会被记为迟取消"。

---

### P3-4 搭档请求

**做什么：** 在活动详情页发起搭档请求、查看收到的请求（接受 / 拒绝 / 取消）。

**要点：** 只能请求同一活动、同一赛制的参与者；不能请求自己；
接受后的请求是**强烈偏好**，不是保证（规范原文：a strong pairing preference, not a guarantee）。

---

### P3-5 迟取消与未到场追踪

**做什么：** 取消时按当前时间自动决定 `cancelled` 还是 `late_cancelled`；
管理员可以把已报名未到场的学生标记为 `no_show`。

**要点：** 判定逻辑必须复用 P3-2 的纯函数，不能在多个地方各写一遍。

---

### P3-6 管理员报名视图与人工修正

**做什么：** `/manage/events/[eventId]/registrations`：查看报名列表、
筛选未解决资格问题、人工补报名/取消、标记未到场。

**要点：** 人工操作也要走同一套状态判定（P3-2），并自动留审计。

---

### P3-7 测试、文档与完成报告

**做什么：** 补齐数据库用例（含**拒绝**用例）、更新 `docs/schema.md`、
`docs/permissions.md` §6.0（`F-STU-14` 等依赖 `partner_requests` 的用例此时可以补上）、
`docs/requirements-traceability.md`、写 Phase 3 完成报告、更新 `OWNER_GUIDE.md` 与 `NEXT_STEP.md`。

---

## 5. 每个步骤的固定动作

1. 先读相关规范与现有代码；
2. 小步改动；
3. 跑 `npm run ci` 与 `npm run db:verify` 并报告**真实退出码**；
4. 检查 diff 的范围、安全与可访问性；
5. 更新文档与追溯表。

---

## 6. 需要产品负责人输入的事项

| # | 事项 | 是否阻塞本阶段 |
|---|---|---|
| O-2 | 报名时间偏移的最终取值 | **不阻塞** —— 已有可配置占位值（P2-9） |
| O-1 | 五种赛制的评分表字段与分数区间 | 不阻塞本阶段，**阻塞 Phase 7** |
| — | 报名确认是否需要站内通知 | 不阻塞 —— 本阶段把"报名成功"写入站内通知，邮件投递仍属 Phase 9 |

---

## 7. 本阶段的完成定义

- `npm run ci` 与 `npm run db:verify` 均退出码 0；
- 新增的每条权限规则都有**允许**与**拒绝**两类测试；
- 报名窗口与取消判定有**边界值**测试（恰好等于开放/截止时刻）；
- 文档与实现一致；
- 完成报告含真实命令结果。
