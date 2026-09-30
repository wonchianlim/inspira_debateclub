# INSPIRA 权限与 RLS 策略计划（Phase 0 交付物）

**文档状态：** Phase 0 草案，等待产品负责人确认
**对应规范：** `INSPIRA_DEEPSEEK_MASTER_SPEC.md` 第 4 章（权限矩阵）、第 7 章（RLS 与安全）、第 14.3 节（数据库与权限测试）
**读者：** 非技术产品负责人 + 后续实现者

> 本文只描述计划。文中没有任何内容表示策略已经创建、或权限测试已经运行通过。

---

## 1. 本文要解决的问题

规范第 7 节的核心要求是：**权限必须在数据库和服务端都强制执行**。

这句话有一个容易忽略的推论：如果权限只在界面隐藏菜单，那么任何会看浏览器开发者工具的人都能越权。所以本系统采用**三层**，其中前两层是真正的安全层：

| 层 | 位置 | 作用 | 是否安全层 |
|---|---|---|---|
| 第 1 层 | 数据库 RLS | 无论谁发出查询，数据库自己判断"这行数据你能看/能改吗" | **是** |
| 第 2 层 | 服务端能力检查 | 在 Server Action 里检查"你这个人能不能做这个动作"，并给出友好错误 | **是** |
| 第 3 层 | 客户端路由守卫 | 隐藏不该看到的入口，改善体验 | 否 |

规范第 14.3 节要求权限测试**主动尝试越权操作**，而不只是确认允许的操作能成功。第 8 节的要求正是为了验证第 1 层真实存在——因为第 2 层可以被某个忘记写检查的新代码路径绕过，而 RLS 不会。

---

## 2. 身份、角色与会话

- 每个账号对应认证服务里的一条用户记录，其 UUID 同时是 `profiles.id`（规范第 6.1 节）。
- 一个账号可以有**多个角色**，角色存在 `user_roles` 关联表里，**不是** `profiles` 上的一个字段（规范 `AGENTS.md` 硬性规则）。
- 数据库里"当前用户是谁"来自会话 JWT，通过 Supabase 提供的 `auth.uid()` 读取。
- **判断当前用户必须用服务端校验过的方法**。在 Next.js 中间件里刷新会话时使用 `getUser()`，不能用只读 cookie 的 `getSession()`（见 `docs/architecture.md` 第 7.4 节）。

五个角色：`student`、`judge`、`coach`、`club_manager`、`super_admin`。

---

## 3. 辅助函数（必须先于任何策略创建）

所有辅助函数都必须是 `SECURITY DEFINER` + `SET search_path = ''` + `STABLE`，原因见 `docs/schema.md` S-5（否则 `user_roles` 上的策略会无限递归）。

| 函数 | 返回 | 含义 |
|---|---|---|
| `current_profile_id()` | uuid | 等价于 `auth.uid()`，统一入口 |
| `has_role(app_role)` | boolean | 当前用户是否拥有该角色 |
| `is_super_admin()` | boolean | 是否超级管理员 |
| `is_manager()` | boolean | 是否 `club_manager` 或 `super_admin` |
| `is_staff()` | boolean | 是否 `coach`/`club_manager`/`super_admin` |
| `is_student()` | boolean | 是否 `student` |
| `is_judge()` | boolean | 是否 `judge` |
| `my_student_id()` | uuid | 当前用户的 `student_profiles.id` |
| `my_judge_id()` | uuid | 当前用户的 `judge_profiles.id` |
| `is_registered_for(event_id)` | boolean | 当前学生是否报名了该事件 |
| `is_on_match_roster(match_id)` | boolean | 当前学生是否在该场比赛名单中（用快照或队伍成员判断） |
| `is_assigned_judge(match_id)` | boolean | 当前裁判是否被指派到该场比赛 |
| `shares_match_with(profile_id)` | boolean | 当前用户与该档案是否同处一场比赛（用于学生/裁判查看名单内他人的基本信息） |

**重要说明：** `SECURITY DEFINER` 函数会**绕过 RLS**。这是辅助函数能工作的前提，但也意味着**每一个这样的函数都必须自己正确地限定范围**，不能写成"返回全部"。函数体内的查询必须显式使用 `auth.uid()` 做过滤，并且全部使用完全限定的表名。

**性能提示：** 策略里调用函数会在每行上执行。这些函数应标记 `STABLE` 以便规划器缓存结果，并且只查询必要的列。数据量增大后如果出现慢查询，优先检查这里（规范第 6.8 节也要求"基于实测的查询计划"再加索引）。

---

## 4. 逐表策略计划

图例：`自己` = 仅当前用户的记录；`员工` = 教练/俱乐部管理员/超级管理员；`管理` = 俱乐部管理员 + 超级管理员；`—` = 无权限。

### 4.1 身份与角色

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | 自己；员工读学生档案；同场比赛的人读基本信息公开字段 | 由注册触发器写入（不给客户端直接 INSERT） | 自己（**不得**修改 `status`）；超级管理员全量 | — （见 `docs/schema.md` S-16） |
| `user_roles` | 自己；管理 | 仅超级管理员 | 仅超级管理员 | 仅超级管理员 |
| `student_profiles` | 自己；员工 | 由注册流程写入 | 自己（基本资料）；员工（学校/年级等运营字段） | — |
| `judge_profiles` | 自己；被指派比赛的双方学生可读该裁判的 `paradigm`；管理 | 由注册流程写入 | 自己（`paradigm`、`experience_notes`）；超级管理员（`approval_status`） | — |

**`profiles.status` 的保护（关键）：** RLS 无法只限制"某几个列"。如果策略允许用户更新自己的行，他就能顺手把自己的 `status` 改成别的值。因此必须额外加一个 `BEFORE UPDATE` 触发器：当修改者是本人且 `status` 发生变化时，抛出异常。**这一条容易漏掉，属于真实越权风险。**

**`user_roles` 的自我保护：** 超级管理员也不能通过普通应用删除自己的最后一条 `super_admin` 记录，否则系统会失去所有管理员。建议在触发器或领域函数中检查"至少保留一个启用状态的超级管理员"。

### 4.2 赛制与资格

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `debate_formats` | 所有已登录用户 | 仅超级管理员 | 仅超级管理员 | 仅超级管理员 |
| `format_positions` | 所有已登录用户 | 仅超级管理员 | 仅超级管理员 | 仅超级管理员 |
| `student_format_profiles` | 自己；教练（若获授权）；管理 | 管理 | 管理；教练（**仅当**产品负责人授予该权限，见待确认 D-2） | 管理 |
| `judge_format_qualifications` | 自己（裁判）；管理 | 超级管理员 | 超级管理员 | 超级管理员 |

学生**不能**读其他学生的资格与评分——这是隐私要求的一部分（规范第 3.1 节"学生绝不能看到其他学生的私人档案"）。

### 4.3 事件与报名

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `events` | 所有已登录用户（学生需能看到开放报名的事件） | 管理 | 管理 | 管理 |
| `event_formats` | 所有已登录用户 | 管理 | 管理 | 管理 |
| `notices` | 按受众计算（见下） | 管理 | 管理 | 管理 |
| `registrations` | 自己；员工 | 自己（仅当报名窗口开放且事件状态允许） | 自己（取消、签到，受时间窗限制）；管理 | 管理 |
| `registration_format_preferences` | 自己；员工 | 自己（仅当报名开放） | 自己（仅当报名开放） | 自己（仅当报名开放） |
| `partner_requests` | 请求方或被请求方本人；员工 | 自己（作为请求方） | 被请求方（回应）；请求方（取消） | — |

**`notices` 的受众规则：** 一条公告同时要满足"已发布（`published_at` 不为空）"且"未过期（`expires_at` 为空或未到）"，再按受众类型判断：

| `audience_type` | 可读范围 |
|---|---|
| `global` | 所有已登录用户 |
| `event` | 该事件的报名学生 + 员工 |
| `role` | 拥有该角色的用户 + 管理 |
| `format` | 该赛制下资格为真的学生 + 员工 |

**`registrations` 的时间窗限制：** 学生自主取消/签到必须在时间窗内。这些判断依赖 `events` 的时间戳，因此策略中需要连接 `events` 或调用辅助函数。注意规范第 9.2 节要求"报名即使定时任务没跑，也按时间戳自动关闭"——所以判断必须基于时间戳比较，而不是事件状态字段。

### 4.4 参与、队伍与比赛

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `participations` | 自己；同场比赛的人；员工 | 管理（或系统函数） | 管理 | 管理 |
| `teams` | 同队成员；同场比赛的人；员工 | 管理 | 管理 | 管理 |
| `team_members` | 同上 | 管理 | 管理 | 管理 |
| `matches` | 该场比赛的学生；被指派裁判；员工 | 管理 | 管理 | 管理 |
| `match_teams` | 同上 | 管理 | 管理 | 管理 |
| `match_motions` | 同上，且 `released_at` 已到 | 管理 | 管理 | 管理 |
| `match_roster_snapshots` | 该场比赛的学生；被指派裁判；员工 | **仅**通过 `start_debate()` 函数（不给任何客户端角色 INSERT 权限） | — | — |

**`match_roster_snapshots` 是只追加的：** 规范第 6.4 节要求 ballot 渲染使用快照，防止后续档案修改改写历史。因此该表对客户端角色**没有** INSERT/UPDATE/DELETE 权限，只能由 `SECURITY DEFINER` 函数写入。

**`match_motions` 的释放控制：** 动议可能在辩论开始前才公布。`released_at` 为空或未到时，学生不应读到内容。这需要在策略里判断时间，或用一个只返回已释放行的视图。

### 4.5 裁判

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `judge_event_availability` | 自己（裁判）；管理 | 自己（裁判报名） | 自己（改为 `unavailable`）；管理（`approved`） | 管理 |
| `judge_assignments` | 被指派的裁判；该场比赛的学生；员工 | 管理 | 管理 | 管理 |

**裁判不能把自己的状态下改成 `approved`：** 策略允许裁判更新自己的行，但必须用触发器限制"裁判本人只能设置 `offered` 或 `unavailable`"。这与 `profiles.status` 是同一类问题。

### 4.6 Ballot

这是规范第 7 节列出的最具体的一条规则：**学生只能读到已发布、且自己在该场比赛名单中的 ballot。**

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `ballot_score_types` | 所有已登录用户（裁判填表需要） | 超级管理员 | 超级管理员 | 超级管理员 |
| `ballot_templates` | 所有已登录用户（裁判需要 schema） | 超级管理员（**待确认**，见 D-4） | 超级管理员 | 超级管理员 |
| `ballots` | 被指派裁判本人；管理（全部）；学生/教练**仅当** `status='published'` 且在自己/所看学生的比赛名单中 | 被指派裁判（草稿） | 被指派裁判**仅当** `status IN ('draft','reopened')`；管理（重开/发布，走函数） | — |
| `ballot_scores` | 随 `ballots` 的可读性 | 随 `ballots` | 随 `ballots` | 随 `ballots` |
| `ballot_feedback` | 随 `ballots` 的可读性 | 随 `ballots` | 随 `ballots` | 随 `ballots` |
| `ballot_review_requests` | 提交该请求的学生；管理 | 学生本人（仅针对自己可见的已发布 ballot，每份一次） | 学生本人（仅撤回，若允许）；管理（处理） | — |

**为什么"已提交 ballot 对裁判只读"必须在数据库层做：** 规范第 2.10 节要求提交后只有在管理员重开后才可编辑。如果只靠界面禁用按钮，裁判可以直接构造请求改结果，而审计只能事后发现。策略里的 `status IN ('draft','reopened')` 条件是真正的防线。

**`winner_team_id` 在 BP 下的特殊性：** 四队赛制不能用"二元胜负"表达（规范第 10.4 节）。`ballots.winner_team_id` 对 BP 可以为空，结果以 `match_teams.placement` 表示。这条需要产品负责人确认（见 D-6）。

### 4.7 教练、通知与审计

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `coach_notes` | 作者教练本人；管理。**学生与裁判一律不可读** | 教练 | 教练（自己的笔记）；管理 | 教练（自己的笔记）；管理 |
| `notifications` | 自己 | 仅系统（函数 / service-role） | 自己（标记已读） | — |
| `system_settings` | 超级管理员；另有少量公开项走单独视图（待确认 D-5） | 超级管理员 | 超级管理员 | 超级管理员 |
| `email_jobs` | **无任何客户端访问** | 仅系统 | 仅系统 | 仅系统 |
| `audit_logs` | 俱乐部管理员 + 超级管理员（只读） | 仅 `SECURITY DEFINER` 函数/触发器 | **无** | **无** |

**`coach_notes` 是本系统隐私要求最高的表。** 规范第 3.3 节明确"学生和裁判无权访问教练笔记"。这条必须有专门的越权测试（见第 6 节）。

**`audit_logs` 的三重保护**（详见 `docs/schema.md` S-15）：

1. 不创建任何 `UPDATE`/`DELETE` 策略；
2. 显式 `REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon;`
3. 客户端角色没有 INSERT 权限，只通过函数写入。

---

## 5. 服务端能力检查（第 2 层）

RLS 表达"这行数据能不能读/写"；服务端能力检查表达"这个动作该不该发生"。后者能给出规范第 13 节要求的中文友好提示。

在 `lib/permissions/` 中定义的能力（与规范第 4 章矩阵逐行对应）：

```text
viewOwnProfile / updateOwnProfile
registerForEvent / cancelOwnRegistration / checkInSelf
viewOwnAssignment / viewOwnMatchBallot
submitAvailability / startAssignedMatch / draftBallot / submitBallot
maintainStudentRating         (教练需授权，见 D-2)
createEventProposal / confirmTeams / moveParticipant
assignJudge / reopenBallot / publishBallot
resolveReviewRequest / manageCoachNotes / postNotice
grantAdminRole / manageFormats / viewAuditLog
```

实现要求：

- 每个 Server Action 在**第一行**调用 `requireCapability(...)`，未通过则立即返回，不触碰数据库；
- `requireCapability` 使用服务端读取的会话身份，**不信任**从客户端传来的角色或用户 id；
- 每个能力都必须在测试中覆盖"允许"和"拒绝"两个方向（规范第 14.2 节）。

---

## 6. 必须显式测试的"拒绝"清单

规范第 14.3 节要求测试**主动尝试**越权。以下是必须逐条覆盖的拒绝用例——每一条都应断言操作**失败**，而不只是断言允许的操作成功。

### 6.0 覆盖状态（更新于 2026-09-29，Phase 4 末）

> **本次更新（P4-7）：** Phase 3 与 Phase 4 建好了 `partner_requests`、`participations`、
> `teams`、`team_members`、`pairing_proposals` 之后，原本"待覆盖"的三条可以补上了：
>
> | 用例 | 说明 | 现在的对应测试 |
> |---|---|---|
> | `F-STU-01` | 读取另一个学生的 `participations` | **`F-STU-30`** ✅ |
> | `F-STU-11` | 为自己创建 `participation`（未授予额外权益时） | **`F-STU-33`** ✅ |
> | `F-STU-14` | 修改**他人**的 `partner_requests` | **`F-STU-14`** ✅（P4-7 新加） |
>
> **`F-STU-14` 是这次新补的，补的过程中发现原来的测试数据不够用：**
> 两位原始学生**双方都是**那条搭档请求的当事人，
> 构造不出"与该请求无关的第三方"。因此测试数据里加了**第三位学生（学生 C）**，
> 只加档案与角色、不加报名，因此不影响其他用例。
> 教训：写"第三方不能做某事"的用例之前，必须先确认测试数据里**真的存在一个第三方**。
>
> ---
>
> ### 覆盖状态（P1-6 原始记录，保留以便追溯）

### 6.0 覆盖状态（2026-09-29，P1-6 实测）

> **更新（P2-1，2026-09-29）：** 新增 `notices` 表后，本节的**新增拒绝用例**为
> `F-STU-20`（读未发布草稿）、`F-STU-21`（读发给裁判角色的通知）、
> `F-STU-22`（读自己没有档案的赛制通知）、`F-STU-23`（读未报名活动的通知）、
> `F-STU-24` 与 `F-COA-06`（学生/教练自行创建通知）。这些**不在**下面原始的 38 条清单内，
> 属于实现 `notices` 时新发现的必要用例，已并入套件。

本节共 **38 条**拒绝用例。**截至 Phase 4 末，其中 18 条已覆盖**，
其余 **20 条**涉及尚未创建的表（Phase 5–9），随其所属表一起加入。

| 状态 | 数量 | 用例 |
|---|---:|---|
| ✅ 已覆盖 | 18 | 原始的 15 条（`F-STU-02`、`F-STU-06`~`F-STU-10`、`F-COA-01`、`F-COA-03`、`F-COA-04`、`F-MGR-01`、`F-MGR-02`、`F-MGR-04`、`F-ALL-01`、`F-ALL-04`、`F-ALL-05`）**加上** `F-STU-01`、`F-STU-11`、`F-STU-14` |
| ⬜ 待覆盖 | 20 | 见下表 |

**除本节这 38 条之外，实现过程中还新发现了 17 条必须测的拒绝用例**（已全部并入套件）：
`F-STU-10a`、`F-STU-10b`、`F-STU-20`~`F-STU-29`、`F-STU-31`~`F-STU-35`、
`F-COA-06`~`F-COA-10`、`F-MGR-04b`、`F-ALL-04b`。
它们不在最初的 38 条清单里，是逐阶段实现时才发现"不测就会漏掉一类越权"的。

| 待覆盖用例 | 依赖的表 | 归属阶段 |
|---|---|---|
| `F-STU-03`、`F-STU-04`、`F-STU-12`、`F-STU-13` | `ballots`、`ballot_review_requests` | Phase 7 / 8 |
| `F-STU-05`、`F-COA-05`、`F-JDG-07` | `coach_notes` | Phase 8 |
| `F-JDG-01`、`F-JDG-08` | `matches` | Phase 5 |
| `F-JDG-02`、`F-JDG-03`、`F-JDG-06`、`F-JDG-09`、`F-COA-02`、`F-MGR-05` | `ballots` | Phase 7 |
| `F-JDG-04`、`F-JDG-05` | `judge_event_availability`、`judge_assignments` | Phase 5 |
| `F-MGR-03`、`F-ALL-03` | `match_roster_snapshots` | Phase 5 |
| `F-ALL-02` | `email_jobs` | Phase 9 |

**另外新增了 4 条本节原本没有、但实现时发现必须测的用例**（已并入套件）：

- `F-STU-10a` 学生保存**自己不合格**的赛制偏好 —— 第 6.3 节的明文要求，单靠界面隐藏是不够的；
- `F-STU-10b` 学生保存**活动未启用**的赛制偏好 —— 同上；
- `F-MGR-04b` 管理员**写**系统设置（`F-MGR-04` 只覆盖了读）；
- `F-ALL-04b` 学生改自己档案时**篡改 id** 冒充他人 —— 针对 `WITH CHECK` 的绕过尝试。

> 说明：`F-ALL-05`（未登录访问）的验证方式在实现过程中被加强了一次。
> Supabase 的 `auto_expose_new_tables` 默认会给 `anon` 自动授权，因此最初未登录访问返回的是
> "0 行"（靠 RLS 挡住）而不是"权限拒绝"。虽然结果同样安全，但它依赖一个可被改动的默认值。
> 已在迁移中显式 `revoke all on all tables in schema public from anon`，
> 现在实测为**权限拒绝**，不再依赖任何默认行为。



### 6.1 学生

| 编号 | 尝试 | 期望 |
|---|---|---|
| F-STU-01 | 读取另一个学生的 `participations` | 拒绝 |
| F-STU-02 | 读取另一个学生的 `student_format_profiles`（评分） | 拒绝 |
| F-STU-03 | 读取 `status <> 'published'` 的 ballot（包括自己比赛的草稿） | 拒绝 |
| F-STU-04 | 读取自己未参加比赛的已发布 ballot | 拒绝 |
| F-STU-05 | 读取任何 `coach_notes` | 拒绝 |
| F-STU-06 | 读取 `audit_logs` | 拒绝 |
| F-STU-07 | 插入/修改 `user_roles`（给自己加 `super_admin`） | 拒绝 |
| F-STU-08 | 修改自己的 `profiles.status` | 拒绝 |
| F-STU-09 | 在报名窗口关闭后新建报名 | 拒绝 |
| F-STU-10 | 为自己选择未启用或自己不合格的赛制偏好 | 拒绝 |
| F-STU-11 | 为自己创建第二个 `participation`（未授予额外权益时） | 拒绝 |
| F-STU-12 | 修改已发布 ballot 的任何字段 | 拒绝 |
| F-STU-13 | 提交超过一次的复核请求 | 拒绝 |
| F-STU-14 | 修改他人的 `partner_requests` | 拒绝 |

### 6.2 裁判

| 编号 | 尝试 | 期望 |
|---|---|---|
| F-JDG-01 | 读取未被指派比赛的名单或 ballot | 拒绝 |
| F-JDG-02 | 提交非自己比赛的 ballot | 拒绝 |
| F-JDG-03 | 修改 `status='submitted'` 的 ballot（未重开） | 拒绝 |
| F-JDG-04 | 把自己的 `judge_event_availability.status` 改成 `approved` | 拒绝 |
| F-JDG-05 | 自己创建 `judge_assignments` | 拒绝 |
| F-JDG-06 | 发布 ballot | 拒绝 |
| F-JDG-07 | 读取 `coach_notes` | 拒绝 |
| F-JDG-08 | 读取与其比赛无关的学生档案 | 拒绝 |
| F-JDG-09 | 在未完成必填项时提交 ballot | 拒绝 |

### 6.3 教练

| 编号 | 尝试 | 期望 |
|---|---|---|
| F-COA-01 | 授予任何角色 | 拒绝 |
| F-COA-02 | 发布或重开 ballot | 拒绝 |
| F-COA-03 | 修改学生评分（当产品负责人**未**授予该权限时） | 拒绝 |
| F-COA-04 | 读取 `audit_logs` | 拒绝 |
| F-COA-05 | 读取另一名教练的私人笔记 | 拒绝 |

### 6.4 俱乐部管理员

| 编号 | 尝试 | 期望 |
|---|---|---|
| F-MGR-01 | 授予 `super_admin` 角色 | 拒绝 |
| F-MGR-02 | 修改或删除任何 `audit_logs` 行 | 拒绝 |
| F-MGR-03 | 修改已开始比赛的 `match_roster_snapshots` | 拒绝 |
| F-MGR-04 | 直接改动系统级安全配置 | 拒绝 |
| F-MGR-05 | 修改已提交 ballot 中裁判的结论（只能重开后由裁判改） | 拒绝 |

### 6.5 全部角色

| 编号 | 尝试 | 期望 |
|---|---|---|
| F-ALL-01 | 以任何应用角色 `UPDATE` 或 `DELETE` `audit_logs` | 拒绝 |
| F-ALL-02 | 以任何应用角色读取或写入 `email_jobs` | 拒绝 |
| F-ALL-03 | 直接 `INSERT` 到 `match_roster_snapshots` | 拒绝 |
| F-ALL-04 | 用伪造的 `profile_id` 冒充他人写入 | 拒绝 |
| F-ALL-05 | 未登录状态下访问任何受保护表 | 拒绝 |

### 6.6 必须**允许**的对照用例

只测拒绝而不测允许，会导致"策略写得太严"这类问题被延迟到上线才发现。以下必须同时覆盖：

- 学生读取自己的报名、参与、已发布 ballot、通知；
- 裁判读取被指派比赛、填写并提交自己的 ballot；
- 教练读取学生历史与已发布 ballot、写自己的笔记；
- 管理员创建事件、确认配对、指派裁判、重开并发布 ballot、查看审计日志；
- 超级管理员授予角色、维护赛制与资格；
- 每场辩论的参与者都能读到该场比赛的对手与裁判信息。

---

## 7. service-role 的边界

规范第 7 节明确：service-role"仅在服务端使用、范围狭窄、**绝不**作为绕过授权的捷径"。

因此：

| 规则 | 说明 |
|---|---|
| R1 | service-role 只允许用于 `docs/architecture.md` 第 7.3 节列出的三种用途 |
| R2 | **权限测试中禁止使用 service-role 连接**——它会绕过 RLS，使测试失去意义。测试必须以各角色的真实身份连接。 |
| R3 | 每个使用处必须写注释说明"为什么不能用用户身份完成" |
| R4 | 代码审查时把 service-role 的 import 作为重点检查项 |

---

## 8. 认证相关的安全要求

来自规范第 7 节，属于 Phase 1 范围：

- 对登录、找回密码、复核请求、邮件触发等接口做**频率限制**（防止撞库和滥用）；
- 写操作使用框架的 CSRF 安全约定（Server Actions 自带保护，Route Handler 需自行校验来源）；
- 所有表单输入经 Zod 校验；
- 生产日志**不得**记录电话号码、邮件正文、认证 token、ballot 内容；
- 未授权访问返回 403 或跳转，且**不泄漏**"该记录是否存在"（规范第 8 节）——例如不能对"记录不存在"和"无权限"返回不同的响应时间或文案。

---

## 9. 需要产品负责人确认的问题

> ✅ **本节已于 2026-09-29 确认。** 产品负责人同意下表中每一条"建议默认值"（D-1 至 D-8 全部）。权威记录见 [`docs/decisions/0009-owner-confirmed-defaults.md`](./decisions/0009-owner-confirmed-defaults.md)。

| 编号 | 问题 | 建议默认 | 影响 |
|---|---|---|---|
| D-1 | 新注册账号的默认角色是什么？（规范未说明） | 默认为 `student`；裁判注册后进入 `pending` 等待批准 | **直接决定 Phase 1 认证流程与多张表的策略** |
| D-2 | 教练是否可以直接修改学生的评分与资格？（规范第 17 节列为待确认） | Phase 1 先设为**只读**，需要时再由超级管理员按人授予 | 影响 RLS 策略与审计范围 |
| D-3 | 教练可以查看哪些学生的历史？是全部还是按政策限定？ | 全部学生（仅运营数据），但不可见笔记以外的私人信息 | 影响 `profiles` 与历史表的策略 |
| D-4 | 谁可以维护 ballot 模板？ | 超级管理员 | 规范第 4 章矩阵未列出该项 |
| D-5 | `system_settings` 是否有需要对学生公开的项？ | 无，仅超级管理员可读 | 影响是否需要额外视图 |
| D-6 | BP 赛制下 `ballots.winner_team_id` 是否允许为空？ | 允许为空，结果用 `placement` 表达 | 影响 ballot 校验规则 |
| D-7 | 裁判是否需要独立的"签到"动作？（规范第 17 节列为待确认；表里已有 `checked_in_at`） | 需要独立签到 | 影响 Phase 6 现场看板的"裁判就绪"判定 |
| D-8 | 学生是否可以撤回复核请求？（规范第 17 节列为待确认） | 允许撤回 | 影响 `ballot_review_requests` 策略 |

---

## 10. 与规范的一致性说明

本文是规范第 4 章矩阵与第 7 节要求的**直接翻译**，未改变任何权限结论。相对规范补充了实现层面的必要细节：

1. `profiles.status` 与 `judge_event_availability.status` 需要触发器保护，因为 RLS 无法只限制单个列；
2. `SECURITY DEFINER` 辅助函数必须自行限定范围，并注意 RLS 递归（详见 `docs/schema.md` S-5）；
3. `match_roster_snapshots` 与 `audit_logs` 对客户端角色完全不可写；
4. 权限测试中禁止使用 service-role 连接，否则测试无效；
5. 第 6 节给出了完整的"拒绝用例"编号，用于 `docs/requirements-traceability.md` 与 Phase 1 的测试实现。
