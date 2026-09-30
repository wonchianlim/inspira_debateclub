# INSPIRA 数据库结构审查与迁移计划（Phase 0 交付物）

**文档状态：** Phase 0 草案，等待产品负责人确认
**对应规范：** `INSPIRA_DEEPSEEK_MASTER_SPEC.md` 第 6 章（数据库结构）、第 5.6 节（可靠性与并发）、第 7 章（安全）
**读者：** 非技术产品负责人 + 后续实现者

> 本文只描述计划。文中没有任何内容表示迁移文件已经写好或已经在数据库上执行过。
> 第 4 节列出的修正建议需要产品负责人确认后，才在 Phase 1 落地为迁移文件。

---

## 1. 文档目的

规范第 6 章已经给出了完整的表结构草案。本文做三件事：

1. **逐表审查**规范第 6 章，找出会导致数据错误、越权或历史被改写的地方；
2. 给出**迁移顺序**，保证从空数据库能一次性重建；
3. 明确**哪些不变量用数据库约束保证**、哪些用领域逻辑保证——这个界线决定系统是否可靠。

---

## 2. 审查依据的原则

来自规范第 6 章开头、第 5.6 节与 `AGENTS.md`：

| 原则 | 含义 |
|---|---|
| 历史只追加 | 已完成的辩论不得因为档案、评分、队伍被修改而改变 |
| 约束兜底 | 业务规则在应用层表达，但关键不变量必须有数据库约束 |
| 默认拒绝 | 每张暴露的表都开 RLS，没有策略即没有权限 |
| 显式区域 | 每个生产依赖的物理位置都要记录 |
| 不做猜测 | 未在规范中说明、且会实质影响数据模型的决策，必须问产品负责人 |

---

## 3. 表清单与状态枚举

规范第 6 章共定义 **28 张表**。按领域分组：

| 领域 | 表 |
|---|---|
| 身份与角色（6.1） | `profiles`、`user_roles`、`student_profiles`、`judge_profiles` |
| 赛制与资格（6.2） | `debate_formats`、`student_format_profiles`、`judge_format_qualifications` |
| 事件与报名（6.3） | `events`、`event_formats`、`notices`、`registrations`、`registration_format_preferences`、`partner_requests` |
| 参与、队伍与比赛（6.4） | `participations`、`teams`、`team_members`、`matches`、`match_teams`、`match_roster_snapshots`、`match_motions` |
| 裁判（6.5） | `judge_event_availability`、`judge_assignments` |
| Ballot 与复核（6.6） | `ballot_templates`、`ballots`、`ballot_scores`、`ballot_feedback`、`ballot_review_requests` |
| 教练、通知与审计（6.7） | `coach_notes`、`notifications`、`email_jobs`、`audit_logs` |

需创建的枚举类型 **13 个**：

`profile_status`、`app_role`、`judge_approval_status`、`event_status`、`registration_status`、`check_in_method`、`partner_request_status`、`entitlement_type`、`participation_status`、`team_status`、`match_status`、`judge_availability_status`、`judge_assignment_role`、`judge_assignment_status`、`ballot_status`、`review_request_status`、`email_job_status`

> 按规范要求，枚举**只**用于稳定的工作流状态；会增长的分类（如位置代号、得分类型）用查找表或受检查的文本。

---

## 4. 对规范第 6 章的修正建议

以下每一条都标注了**问题**、**后果**和**建议**。这些是 Phase 1 落地前需要确认的内容。

### S-1 ★ 重复报名与"取消后重新报名"冲突

**问题：** `registrations` 上有 `UNIQUE (event_id, student_id)`，但规范第 3.1 节允许学生取消报名，第 14.4 节的端到端场景要求"取消后按规则重新报名"。如果重新报名是插入新行，唯一约束会直接拒绝。

**建议：** 明确为**同一条记录状态回退**：重新报名时 `UPDATE` 原行，把 `status` 从 `cancelled` / `late_cancelled` 改回 `registered`，并把 `cancelled_at` 置空。这样既保留唯一约束（防止真正的重复报名），又支持重新报名。**同时必须保留历史**：`audit_logs` 记录这次改回，`late_cancelled` 的历史事实不能被抹掉——因此建议新增 `late_cancellation_count` 或在审计中查询，而不是靠 `status` 字段记住。

**影响：** 若不澄清，Phase 3 会写出与唯一约束冲突的代码，或被迫删掉唯一约束而放开真正的重复报名。

---

### S-2 ★ 搭档请求"同一请求者/事件/赛制只能有一个活跃请求"无法用普通唯一索引实现

**问题：** 规范第 6.3 节要求"同一请求者、同一事件、同一赛制最多一个活跃请求"。但限制只对活跃状态（`pending`、`accepted`）成立，且 `format_id` 可为空——在 PostgreSQL 里 `NULL` 彼此不相等，普通唯一索引对空值不起作用。

**建议：** 使用**部分唯一索引 + 空值归一**：

```sql
CREATE UNIQUE INDEX partner_requests_one_active
  ON partner_requests (requester_student_id, event_id, COALESCE(format_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('pending', 'accepted');
```

**影响：** 不这样做，同一学生可以无限提交重复搭档请求，管理员的配对界面会被污染。

---

### S-3 ★ "一个参赛者只能属于一个未解散队伍"缺少数据库层保证

**问题：** 规范第 6.4 节要求"服务端逻辑必须确保一个 participation 至多在一个非 `dissolved` 队伍里"。但 `team_members` 无法直接引用 `teams.status`，普通唯一索引表达不了这个规则。

**建议：** 二选一，需要产品负责人批准：

- **方案 A（推荐）**：在 `team_members` 增加 `is_active BOOLEAN NOT NULL DEFAULT true`，并建立部分唯一索引：
  ```sql
  CREATE UNIQUE INDEX team_members_one_active_team
    ON team_members (participation_id) WHERE is_active;
  ```
  再用 `teams.status` 变更的**触发器**同步 `is_active`（队伍 `dissolved` 时置 false）。
- **方案 B**：写一个 `BEFORE INSERT OR UPDATE` 触发器函数，直接查询 `teams.status` 并在冲突时 `RAISE EXCEPTION`。

方案 A 性能更好（索引直接拦截），方案 B 逻辑更集中。无论如何，**不能只靠应用层约束**——否则并发确认配对时会产生同一学生出现在两个队伍的情况。

---

### S-4 ★ "同一裁判不能被指派到时间重叠的两场比赛"需要排他约束

**问题：** 规范第 6.5 节要求防止一个裁判同时被指派到时间重叠的比赛。但比赛时间在 `matches` 表，指派在 `judge_assignments` 表，跨表无法用普通约束表达。

**建议：** 在 `judge_assignments` 上**冗余**比赛时间窗（`scheduled_start`、`scheduled_end`，由 `matches` 变更时同步），然后使用 PostgreSQL 的排他约束：

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE judge_assignments
  ADD CONSTRAINT judge_assignments_no_overlap
  EXCLUDE USING gist (
    judge_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  ) WHERE (status <> 'cancelled');
```

**影响：** 不做的话，两个房间同时开赛而同一个裁判被指派到两处，只能靠人工发现。

> 这是规范第 6 章未覆盖、但第 6.5 节文字明确要求的行为。

---

### S-5 ★ `has_role()` 辅助函数与 RLS 的递归陷阱

**问题：** 规范第 7 节要求用 `has_role(role)` 这类辅助函数。但如果该函数以普通权限读取 `user_roles`，而 `user_roles` 自身启用了 RLS，策略里再调用 `has_role()`，就会形成 **RLS 无限递归**，查询直接报错。

**建议：** 按 Supabase 的标准做法实现，三处缺一不可：

1. 函数用 `SECURITY DEFINER`（以定义者权限运行，绕过 RLS）；
2. 固定 `search_path`，并使用**完全限定表名**（`public.user_roles`），防止 `search_path` 劫持；
3. 标记 `STABLE`，并撤销公众执行权限后只授予需要它的角色。

```sql
CREATE OR REPLACE FUNCTION public.has_role(target public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE profile_id = auth.uid() AND role = target
  );
$$;
```

**影响：** 这是 Supabase 项目最常见的严重故障之一，症状是"所有查询报错"，排查成本高。必须在 Phase 1 一次做对。

---

### S-6 ★ 缺少"赛制位置"查找表，与"不要把数值散落在代码里"冲突

**问题：** 规范第 6.4 节说"位置在领域逻辑中按赛制校验：PF/JWSD/WSDC/ONE_V_ONE 用 `PROP`/`OPP`，BP 用 `OG`/`OO`/`CG`/`CO`"，并明确"不要用一个僵化的数据库枚举"。结果是这份对应关系会**硬编码在代码里**，与第 6.2 节"绝不要在各处硬编码队伍人数"的精神不一致——而且第 8 章要求每种赛制有独立运营页面。

**建议：** 新增查找表：

```text
format_positions
  id UUID PRIMARY KEY
  format_id UUID NOT NULL REFERENCES debate_formats(id)
  code TEXT NOT NULL              -- PROP / OPP / OG / OO / CG / CO
  display_name TEXT NOT NULL
  team_slot SMALLINT NOT NULL     -- 该位置对应第几支队伍
  display_order SMALLINT NOT NULL
  created_at
  UNIQUE (format_id, code)
  UNIQUE (format_id, team_slot)
```

**影响：** 新增赛制时只需加数据，不用改代码；也避免"每种赛制一个 if 分支"的蔓延。

---

### S-7 ★ 缺少系统设置表，但规范要求超级管理员可管理"系统设置"

**问题：** 规范第 3.5 节列出超级管理员可"管理系统设置"，第 8 章有 `/admin/settings` 路由。但第 6 章没有任何承载这些设置的表，设置将无处存放。

**建议：** 新增：

```text
system_settings
  key TEXT PRIMARY KEY
  value JSONB NOT NULL
  description TEXT NULL
  updated_by UUID NOT NULL REFERENCES profiles(id)
  created_at, updated_at
```

并把第 17 节中待确认的默认值（报名提前量、预警提前量、各类提醒时间）放进这里，而不是写死在代码里。

---

### S-8 ★ 裁判 paradigm 没有历史版本，会改写历史

**问题：** `judge_profiles.paradigm` 是一个可变的文本字段。规范第 2.9 节要求学生能看到裁判 paradigm，第 2.10 节要求已发布 ballot 显示裁判身份。裁判以后修改 paradigm，历史比赛呈现的信息就变了——这与"preserve historical records"的总要求冲突。

**建议：** 二选一：

- 在 `match_roster_snapshots`（或新增的 `match_judge_snapshots`）里**快照**当时可见的 paradigm；
- 或新增 `judge_paradigm_versions` 表，按时间保存版本，展示时按比赛时间取当时版本。

推荐第一种，因为它与"开始辩论即锁定名单"的机制一致。

---

### S-9 `events.event_date` 与 `starts_at` 可能互相矛盾

**问题：** 同时存在 `event_date DATE` 和 `starts_at TIMESTAMPTZ`。两者可以不一致（例如 `event_date` 填了周日，`starts_at` 是周一），而"每周一次"的统计与列表分组依赖前者。

**建议：** 明确 `event_date` 是**业务日期**，并加约束或触发器，要求它与 `starts_at` 在 `timezone` 下的日期一致；或干脆去掉 `event_date`，改为按需从 `starts_at` 派生。前者更直观，推荐。

---

### S-10 `matches.status` 里 `missing_participant` / `ready` 是时间派生状态

**问题：** 规范第 2.8 节说明这些状态随时间变化。把它们**存储**在 `matches.status` 里，就需要一个定时任务持续更新，否则过时。

**建议：** 明确两者的分工：

- `matches.status` 只存**由人的动作驱动**的状态：`scheduled`、`started`、`ballot_submitted`、`published`、`cancelled`；
- `missing_participant` / `ready` 作为**读取时计算**的派生值（由报名签到数据 + 时间计算得出），不落库。

这样避免"数据库里的状态和实际不一致"，也少一个后台任务。若产品负责人希望保留落库版本，则必须同时提供定时刷新任务，并承担刷新延迟。

---

### S-11 `partner_requests` 缺少响应时间字段

**问题：** 表里有 `status` 但没有"何时被接受/拒绝"。规范第 3.1 节要求学生可以响应搭档请求，第 12 节要求发送搭档请求相关的邮件——没有时间字段，无法审计，也无法做超时处理。

**建议：** 新增 `responded_at TIMESTAMPTZ NULL`、`responded_by_student_id`（若允许代答）、以及 `expires_at TIMESTAMPTZ NULL`（若要做超时）。

---

### S-12 `participations.participation_number` 的并发风险

**问题：** `UNIQUE (event_id, student_id, participation_number)` 能防重复，但"取当前最大号 +1"这个读-改-写序列在并发下会撞车。

**建议：** 把创建 participation 的逻辑放进一个数据库函数，在事务内对 `(event_id, student_id)` 加行锁后再计算编号；或捕获唯一冲突后重试一次。不能只在应用层"先查再插"。

---

### S-13 `ballot_scores.score_type` 是自由文本，缺校验

**问题：** `score_type TEXT NOT NULL` 没有约束。规范举例 WSDC 用 `content`/`style`/`strategy`/`total`，PF 用 `speaker_points`，BP 用 `speaker_score`。拼写错误会静默写入脏数据。

**建议：** 新增查找表 `ballot_score_types (id, format_id, code, display_name, min_value, max_value, is_total)`，`ballot_scores.score_type` 改为引用它。这同时解决了"分值范围校验"——目前规范没有地方存放每个赛制的分数上下限，而第 17 节把"确切的分数字段与范围"列为待确认事项。

---

### S-14 `ballot_templates` 缺少"每个赛制只有一个启用版本"的保证

**问题：** `UNIQUE (format_id, version)` 保证版本号不重复，但允许多个 `active = true`，取哪个版本会变得不确定。

**建议：**

```sql
CREATE UNIQUE INDEX ballot_templates_one_active
  ON ballot_templates (format_id) WHERE active;
```

同时对 `schema JSONB` 做结构校验（在写入时用应用层校验，或按 JSON Schema 元模式校验），避免"模板字段写错导致裁判无法提交"。

---

### S-15 `audit_logs` 的不可变需要显式授权控制

**问题：** 规范要求"任何普通应用角色都不能改或删审计行"。仅靠"不写 UPDATE/DELETE 策略"在某些配置下不够，因为表的所有者与 `GRANT` 权限仍然可能放开。

**建议：** 三重保证：

1. 对 `audit_logs` **不创建**任何 `UPDATE`/`DELETE` 的 RLS 策略；
2. 显式撤销：
   ```sql
   REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon;
   ```
3. 只通过 `SECURITY DEFINER` 函数或触发器写入，不直接给应用角色 `INSERT`。

另外，`actor_profile_id` 建议改为 `ON DELETE SET NULL`（见 S-16）。

---

### S-16 ★ 个人信息删除策略与审计/历史保留冲突

**问题：** 规范第 17 节把"个人数据与不活跃账号的保留/删除策略"列为待确认事项。但当前结构里：

- `profiles.id` 引用 `auth.users(id)`，且大量表以 `REFERENCES profiles(id)` 记录操作者（`created_by`、`assigned_by`、`published_by`、`reopened_by`、`resolved_by`、`updated_by`）；
- 一旦真的要删除用户，"引用完整性"会阻止删除；若改成级联删除，又会让审计记录和历史 ballot 的操作者信息一起消失。

**建议（需要产品负责人确认）：** **不做物理删除**。采用"停用 + 匿名化"：

1. `profiles.status` 置为 `inactive`；
2. 按既定流程清空 `first_name`/`last_name`/`phone`/`email` 等个人字段，替换为占位符；
3. 保留 `profiles.id` 与审计记录的关联，但不再指向可识别个人；
4. 对 `audit_logs.actor_profile_id`、各类 `*_by` 字段使用 `ON DELETE SET NULL` 或维持不删除。

这样同时满足"保留历史"与"应删除个人数据"两个要求。**这是规范没有解决的真实冲突，必须由产品负责人决定。**

---

### S-17 较小的补充建议（低风险）

| 编号 | 内容 |
|---|---|
| S-17a | `email_jobs` 缺 `updated_at`，与第 6 章"所有可变表都有 created_at/updated_at"不一致；建议补上，并增加 `next_attempt_at TIMESTAMPTZ NULL` 支持退避重试。 |
| S-17b | `email_jobs` 出队使用 `FOR UPDATE SKIP LOCKED` 时，建议同时记录 `locked_at`，以便回收卡死的 `processing` 记录。 |
| S-17c | `match_roster_snapshots` 建议增加 `UNIQUE (match_id, team_id, speaker_position)`（限定 `speaker_position IS NOT NULL`），防止同一队内出现两个相同发言位的残缺数据。规范只约束了 `(match_id, participation_id, position)`。 |
| S-17d | `team_members.speaker_position` 可为空，而 PostgreSQL 的唯一索引不约束空值，因此"多个空发言位"是被允许的（这应该是有意的）；建议在注释中写明，避免后来者误以为是漏洞。 |
| S-17e | `notices` 的 audience 约束建议明确为：`global` 三者皆空；`event` 只有 `event_id`；`role` 只有 `role`；`format` 只有 `format_id`。 |
| S-17f | `notices` 没有"谁读过"的状态，而 Phase 9 要求站内通知中心。建议新增 `notice_reads (notice_id, profile_id, read_at)`，与 `notifications` 区分开（前者是管理员公告，后者是系统通知）。 |
| S-17g | `student_profiles.notes` 是一个自由文本字段，但规范没有说明它的可见范围（`coach_notes` 已明确不对学生和裁判可见）。建议明确：若它属于运营备注，则应纳入 RLS 限制，或直接删除以免与 `coach_notes` 混淆。 |
| S-17h | `profiles.email` 与 `auth.users.email` 重复。邮箱变更时会不一致。建议明确以认证服务为准，并用触发器或服务端逻辑同步，或从 `profiles` 移除该字段。 |
| S-17i | `matches.room_name NOT NULL`，但规范第 2.7 节允许"提案解决期间存在不完整队伍"。建议允许创建占位房间名，或在配对确认前不创建 `matches` 行——需要明确配对流程的落库时机。 |
| S-17j | `judge_event_availability.status` 里的 `assigned` 与 `judge_assignments` 表信息重复，属于派生值。建议去掉该枚举值，改为查询得出，避免两处不一致。 |

---

## 5. 迁移顺序

**命名规则（P1-4 实测得出的硬性要求）：** Supabase CLI 只识别 `<时间戳>_<名称>.sql` 形式的文件名。
不符合的文件会被**跳过并只打印一行警告**——实测中一个 `.gitkeep` 就触发了
`Skipping migration .gitkeep... (file name must match pattern "<timestamp>_name.sql")`。

⚠️ 因此本文件早期版本里写的 `0001_enums.sql` 这种命名**不会被 Supabase 执行**。
下面已改为时间戳前缀；时间部分刻意按 100 秒递增，这样既满足 CLI 要求，
又能让人一眼看出先后顺序，且排序稳定（不依赖文件创建时间）。

**每个迁移都必须能从空数据库一次性执行成功**（规范第 16 章）。

**实施状态（2026-09-29，P1-5）：** 下列 16 条中已有 **10 条落地**，对应 Phase 1 的范围
（身份、角色、赛制、资格、事件、报名、审计基础）：

| 已实施 | 留待后续阶段 |
|---|---|
| `...090000_extensions_and_helpers` | `...090700_participation_teams`（Phase 4） |
| `...090100_enums` | `...090800_matches`（Phase 5） |
| `...090200_identity` | `...090900_judges`（Phase 5） |
| `...090300_formats` | `...091000_ballots`（Phase 7） |
| `...090400_qualifications` | `...091400_workflow_functions`（随各工作流阶段） |
| `...090500_events` | `...091500_audit_triggers`（随各特权操作） |
| `...090600_registration` | |
| `...091100_ops` | |
| `...091200_indexes` | |
| `...091300_rls` | |
| `...091400_rate_limiting`（P1-8 新增，见 ADR-0012） | |

实测：从空库重建后得到 **32 张表、71 条策略、32 张启用 RLS 的表、110 个索引、37 个函数、64 个触发器（含 27 个审计触发器）、17 个枚举**（**2026-09-29 最终值**；P1-5 时点为 14/32/14/40/19；P1-8 新增 `rate_limit_counters` 与两个限流函数；**P2-1 新增 `notices`**；**P2-2 新增 3 个审计函数与 12 个审计触发器**；**P3-1 新增 `partner_requests` 表与 `partner_request_status` 枚举，并给 `registrations` 与 `partner_requests` 补上审计触发器**；**P3-4 新增搭档码列与按码查找函数**；**P4-1 新增 `participations` / `teams` / `team_members` 三张表与三个枚举，并加了跨表一致性触发器**；**P4-5 新增 `pairing_proposals` 表与 `pairing_proposal_status` 枚举，并给 `teams` 补上锁定/人工调整标记**；**P5-1 新增 `matches` / `match_teams` / `match_roster_snapshots` / `match_motions` / `judge_event_availability` / `judge_assignments` 六张表与四个枚举**；**P5-5 新增 `start_match()`、`emergency_correct_roster()`、`set_ironman()` 三个数据库函数**；**P5-7 新增 `move_team_member()`**；**P6-4 给 `events` 补上 `match_start_at` / `match_interval_minutes` / `room_names` 三项比赛设置**；**P7-1 新增 `ballot_templates` / `ballots` / `ballot_scores` / `ballot_feedback` / `ballot_review_requests` 五张表与两个枚举**），
并且 27 条 RLS 授权用例全部通过（`npm run db:rls-smoke`）。

两点与本文早前描述的差异，均已实测确认：

1. **`btree_gist` 扩展尚未创建。** 它只被 `judge_assignments` 的排他约束需要，属于 Phase 5。
   提前创建会违反 `AGENTS.md` 的 Scope Discipline。
2. **本阶段只创建了 6 个枚举**，而不是第 3 节列出的全部。其余枚举随其所属表一起创建。

```text
20260929090000_extensions_and_helpers.sql
     -- btree_gist 扩展；updated_at 自动更新触发器函数；
     -- current_profile_id()、has_role()、is_manager()、is_super_admin()

20260929090100_enums.sql
     -- 第 3 节列出的全部枚举类型

20260929090200_identity.sql
     -- profiles, user_roles, student_profiles, judge_profiles

20260929090300_formats.sql
     -- debate_formats, format_positions（S-6）

20260929090400_qualifications.sql
     -- student_format_profiles, judge_format_qualifications

20260929090500_events.sql
     -- events, event_formats, notices(+notice_reads, S-17f)

20260929090600_registration.sql
     -- registrations, registration_format_preferences, partner_requests

20260929090700_participation_teams.sql
     -- participations, teams, team_members

20260929090800_matches.sql
     -- matches, match_teams, match_roster_snapshots, match_motions

20260929090900_judges.sql
     -- judge_event_availability, judge_assignments（含 S-4 排他约束）

20260929091000_ballots.sql
     -- ballot_score_types（S-13）, ballot_templates, ballots,
     -- ballot_scores, ballot_feedback, ballot_review_requests

20260929091100_ops.sql
     -- coach_notes, notifications, email_jobs, audit_logs, system_settings（S-7）

20260929091200_indexes.sql
     -- 第 6.8 节要求的全部索引 + 第 4 节新增的部分唯一索引

20260929091300_rls.sql
     -- 对每张暴露的表 ENABLE ROW LEVEL SECURITY，并建立策略（见 docs/permissions.md）
     -- audit_logs 显式 REVOKE UPDATE/DELETE/TRUNCATE（S-15）

20260929091400_workflow_functions.sql
     -- 第 7 节列出的原子操作函数（SECURITY DEFINER + 固定 search_path）

20260929091500_audit_triggers.sql
     -- 需要自动审计的动作触发器

seed.sql
     -- 五种赛制 + format_positions；ballot 模板留待 Phase 7
```

**顺序上的关键依赖：**

- 枚举必须先于使用它们的表；
- `has_role()` 必须早于任何 RLS 策略；
- `btree_gist` 扩展必须早于 S-4 的排他约束；
- RLS 与策略在表结构之后、业务函数之前；
- 业务函数用 `SECURITY DEFINER`，因此必须晚于表与策略。

**关于 `profiles` 与 `auth.users`：** `profiles.id` 引用认证服务的 `auth.users(id)`。这意味着该迁移只能在一个已启用认证服务的 Supabase 项目上执行。若 Phase 0 最终选择"同区域托管 PostgreSQL + 自建认证"（规范第 5.1 节备选方案 2），本迁移的第 0003 步必须改写。**这正是必须在 Phase 1 之前确定基础设施的原因。**

---

## 6. 约束与索引的职责分工

| 规则 | 由谁保证 | 理由 |
|---|---|---|
| 重复报名 | 数据库 `UNIQUE (event_id, student_id)` + S-1 的状态回退逻辑 | 必须是最后防线 |
| 重复搭档活跃请求 | 数据库部分唯一索引（S-2） | 需要条件唯一 |
| 一人一活跃队伍 | 数据库部分唯一索引 + 触发器（S-3） | 跨表条件 |
| 裁判时间冲突 | 数据库排他约束（S-4） | 需要时间区间重叠判断 |
| 资格不符的赛制选择 | 应用层（Domain）+ 数据库 `CHECK`（`student_format_profiles`） | 需要读多张表 |
| 评分 1–10 范围 | 数据库 `CHECK` | 简单值域 |
| 赛事时间先后关系 | 数据库 `CHECK` | 同表值域 |
| 状态机合法迁移 | 应用层领域函数 | 规则会演进，且需要友好错误 |
| 名单开始后锁定 | 应用层 + `roster_locked_at` 判断 | 时间相关 |
| ballot 必填字段 | 应用层按模板校验 + `ballot_templates.schema` | 按赛制变化 |
| 审计不可变 | 数据库权限 + RLS（S-15） | 安全边界 |

---

## 7. 必须写成数据库函数的原子操作

规范第 5.6 节要求多行操作使用事务。以下操作必须实现为 PostgreSQL 函数（`SECURITY DEFINER` + 固定 `search_path`），由 Server Action 通过 RPC 调用：

| 函数 | 涉及的表 | 关键不变量 |
|---|---|---|
| `confirm_pairing(event_id, ...)` | `teams`、`team_members`、`participations` | 一人一活跃队伍；队伍人数与赛制一致 |
| `move_participant(participation_id, to_team_id)` | `team_members` | 同上；写审计 |
| `start_debate(match_id)` | `matches`、`match_roster_snapshots` | 幂等；写快照与 `roster_locked_at`；裁判必须是受指派者 |
| `submit_ballot(ballot_id, payload)` | `ballots`、`ballot_scores`、`ballot_feedback`、`matches` | 校验模板必填项；状态必须为 `draft`/`reopened` |
| `publish_ballot(ballot_id)` | `ballots`、`matches`、`email_jobs` | 原子设置发布时间并入队通知 |
| `reopen_ballot(ballot_id, reason)` | `ballots` | 记录 actor、原因、前后值 |
| `create_participation(...)` | `participations` | 并发下正确分配 `participation_number`（S-12） |
| `dispatch_email_jobs(limit)` | `email_jobs` | `FOR UPDATE SKIP LOCKED`，幂等 |

每个函数都必须在 `docs/permissions.md` 中明确：谁能调用、函数内部做了哪些权限检查（因为 `SECURITY DEFINER` 会绕过 RLS，**函数自己必须重新检查调用者身份**）。

---

## 8. 历史快照策略

规范反复强调"不要让当前数据改写历史"。对应关系：

| 需要保留下来的历史 | 快照方式 |
|---|---|
| 参赛时的能力评分 | `participations.rating_snapshot` |
| 开赛时的名单与发言位 | `match_roster_snapshots`（原子写入） |
| 开赛时裁判可见的 paradigm | 见 S-8，建议快照 |
| ballot 使用哪一版模板 | `ballots.template_id` |
| 结果 | `match_teams.result` / `placement` + `ballots.winner_team_id` |
| 谁在何时改了什么 | `audit_logs` |

**注意 BP 的特殊性：** 规范第 10.4 节要求四队赛制不能简化为"二元胜负"。因此对 BP，`ballots.winner_team_id` 可能为空，结果以 `match_teams.placement` 表达。这一点必须在实现和测试中显式覆盖。

---

## 9. 本地与测试数据库

规范第 14.3 节要求"尽可能使用一次性的/本地 Supabase"，并验证"迁移能从空数据库执行"。

计划：

- 用 Supabase CLI 的本地开发环境（`supabase start`）跑一个一次性数据库；
- 在 CI 中每次执行：`supabase db reset` → 应用全部迁移 → 执行 `seed.sql`；
- 权限测试针对该本地数据库运行（见 `docs/testing.md`）；
- **绝不**在本地或 CI 中连接生产数据库；
- 本地使用的都是虚构数据，不含任何真实学生信息（`AGENTS.md` 硬性要求）。

---

## 10. 需要产品负责人确认的问题

> ✅ **本节已于 2026-09-29 确认。** 产品负责人同意下表中每一条"建议默认值"。权威记录见 [`docs/decisions/0009-owner-confirmed-defaults.md`](./decisions/0009-owner-confirmed-defaults.md)。
> ⚠️ **仍未决：D-7（各赛制的分数字段与上下限）与 D-9（报名时间偏移、提醒时间表、各赛制 ballot 字段）。** 这两项没有"建议默认值"，需要产品负责人提供专业内容。

| 编号 | 问题 | 建议默认 | 影响 |
|---|---|---|---|
| D-1 | S-1：取消后重新报名是"状态回退"还是"允许第二行"？ | 状态回退 | 影响报名表结构与历史保留方式 |
| D-2 | S-16：不活跃账号是"物理删除"还是"停用 + 匿名化"？ | 停用 + 匿名化 | **影响审计与历史能否保留** |
| D-3 | S-3：一人一活跃队伍用部分唯一索引（方案 A）还是触发器（方案 B）？ | 方案 A | 实现细节，影响后续维护 |
| D-4 | S-6：新增 `format_positions` 查找表是否同意？ | 同意 | 影响是否出现硬编码分支 |
| D-5 | S-7：新增 `system_settings` 表是否同意？ | 同意 | 影响管理员能否调整时间参数 |
| D-6 | S-10：`missing_participant`/`ready` 是落库还是读取时计算？ | 读取时计算 | 影响是否需要定时任务 |
| D-7 | S-13：每个赛制每类分数的上下限是多少？ | 需产品给定 | **直接阻塞 Phase 7** |
| D-8 | S-17g：`student_profiles.notes` 的可见范围是什么？ | 仅管理员可见 | 影响 RLS 策略与隐私 |
| D-9 | 第 17 节全部待确认事项（报名时间偏移、提醒时间表、各赛制 ballot 字段、教练调整评分权限等） | 需产品给定 | 分别阻塞 Phase 3、Phase 7、Phase 9 |

---

## 11. 与规范的一致性说明

本文**没有修改**规范第 6 章的任何表定义，只提出修正建议。第 4 节的建议在经产品负责人确认前不会写成迁移文件。

其中 S-1、S-2、S-3、S-4、S-5、S-15、S-16 属于**会导致数据错误、越权或历史丢失**的问题，建议在进入 Phase 1 前全部确认。
