# INSPIRA V1 需求追溯表（requirements traceability）

> **文档状态：计划文档（Phase 0 交付物）。**
> 本文档把 V1 主规格中的**每一条需求**映射到①交付它的构建阶段（主规格第 15 节），以及②至少一种计划中的验证方式（引用 [`docs/testing.md`](./testing.md) 中的测试类型或具体检查）。
> **本文档不声称任何测试已经运行或已经通过。** 所有"验证方式"都是**计划**；实际结果只能由对应阶段真实执行的命令输出证明（主规格第 14.6 节、`AGENTS.md` Testing Rules）。

**依据：** `INSPIRA_DEEPSEEK_MASTER_SPEC.md`；`AGENTS.md`。
**配套文档：** [`docs/testing.md`](./testing.md)（测试策略与测试名称）、[`docs/permissions.md`](./permissions.md)（RLS 策略设计）、[`docs/schema.md`](./schema.md)、[`docs/architecture.md`](./architecture.md)、[`docs/deployment-regions.md`](./deployment-regions.md)。

---

## 0. 编号规则与阶段对照

### 0.1 需求编号前缀

| 前缀 | 含义 | 来源章节 | 条目数 |
|---|---|---|---:|
| `SC` | 成功标准（success criteria） | 1.1 | 11 |
| `STU` | 学生用户故事与"绝不能看到"约束 | 3.1 | 14 |
| `JDG` | 裁判用户故事与"不能做"约束 | 3.2 | 14 |
| `COA` | 教练用户故事与可见性边界 | 3.3 | 6 |
| `MGR` | 俱乐部经理用户故事与"不能做"约束 | 3.4 | 14 |
| `ADM` | 超级管理员用户故事 | 3.5 | 6 |
| `PERM` | 权限矩阵的能力行（allow/deny 模式） | 4 | 21 |
| `PERM-D` | 权限矩阵中**显式拒绝**的单元格（每一格一行） | 4 | 45 |
| `SEC` | 安全与 RLS 要求 | 7（含 5.3 密钥要求） | 20 |
| `RT` | 路由访问控制要求 | 8 | 3 |
| `WF` | 每周工作流与状态跳转规则 | 9 | 32 |
| `PAIR` | 配对、排赛、边/位、ironman、人工编辑与算法测试 | 10 | 37 |
| `JASG` | 裁判指派逻辑 | 11 | 6 |
| `NOTIF` | 通知与计划任务要求 | 12 | 15 |
| `DOD` | Definition of Done 条目 | 16 | 11 |
| **合计** | | | **255** |

### 0.2 交付阶段（主规格第 15 节）

| 简称 | 完整名称 |
|---|---|
| 阶段 0 | Discovery and architecture（发现与架构，无功能实现） |
| 阶段 1 | Foundation, auth, profiles, roles, and schema core（基础、认证、资料、角色、核心库表） |
| 阶段 2 | Admin users, formats, and events（用户/格式/事件管理） |
| 阶段 3 | Student registration and preferences（学生报名与偏好） |
| 阶段 4 | Pairing and participation proposals（配对与参与提案） |
| 阶段 5 | Matches, rooms, sides, and judge assignments（比赛、房间、边/位、裁判指派） |
| 阶段 6 | Check-in and live dashboard（签到与实时面板） |
| 阶段 7 | Ballots（选票） |
| 阶段 8 | History, coach tools, and reviews（历史、教练工具、复核） |
| 阶段 9 | Notifications and operational hardening（通知与运营加固） |
| 阶段 10 | Release readiness（发布准备） |

### 0.3 验证方式代号（详细定义见 `docs/testing.md`）

| 代号 | 含义 |
|---|---|
| `静态` | Prettier / ESLint / `tsc` 类型检查 |
| `单元` | Vitest 纯逻辑测试（`tests/unit/…`） |
| `组件` | React Testing Library（`components/…/__tests__`） |
| `集成` | Vitest + 真实测试数据库（`tests/integration/…`） |
| `RLS` | 数据库行级安全授权测试，**含显式拒绝断言**（`tests/integration/rls/…`） |
| `E2E` | Playwright 端到端（`tests/e2e/…`，对应主规格 14.4 的 J1–J9） |
| `迁移` | 从空数据库重跑全部迁移与种子数据（`tests/integration/database/migrations.test.ts`） |
| `构建` | `pnpm build` 生产构建 |
| `手工` | 人工验收清单（主规格 14.5，见 `docs/testing.md` 第 9 节） |
| `连通性` | 中国大陆无 VPN 连通性矩阵，**结果记录在 `docs/deployment-regions.md`**（不在此表复述） |
| `文档复核` | 对文档/配置/提交内容的人工复核（例如密钥、个人信息、区域记录） |

---

## 0.4 阶段 1 实际验证对照（P1-13 补充）

> **为什么需要这一节。** 本表在 Phase 0 编写时，"验证方式"一列填的是**计划中**的测试文件
> （主要是 `tests/integration/rls/*.rls.test.ts`）。实际实现时因为本机没有 `psql`，
> 把全部权限断言改放进了 `scripts/db-tests.sql`，通过 `docker exec` 执行。
> **能力没有减少，但文件名对不上。** 这一节说明计划与实际的差异，并给出实际证据清单。
> 表中其余行仍保留计划值，待对应阶段实施时改为实际文件名。

### 0.4.1 计划与实际的差异

| 计划中的验证方式 | 实际落地方式 | 差异原因 |
|---|---|---|
| `tests/integration/rls/anonymous.rls.test.ts` | `scripts/db-tests.sql` 的「匿名」段（14 条） | 无需 Node 侧数据库驱动，直接用容器内 `psql` |
| `tests/integration/rls/student.rls.test.ts` 等五个角色文件 | `scripts/db-tests.sql` 的「授权」段（36 条，含 14 条允许 + 22 条拒绝） | 同上；五个角色用同一套断言框架，比五个文件更难漏测 |
| `tests/integration/rls/serviceRoleBoundary.test.ts` | `npm run check:server-only`（构建期真实失败） | 构建期检查比运行时断言更强：代码根本编译不过 |
| `tests/integration/actions/*.test.ts`（Zod 校验、CSRF） | `tests/unit/auth-actions-wiring.test.ts` + `tests/unit/env.test.ts` + 源码级顺序断言 | Phase 1 的 Server Action 数量少，源码级断言已足够；Phase 9 补真实集成测试 |
| 迁移断言"每张暴露表均已 ENABLE ROW LEVEL SECURITY" | `scripts/db-tests.sql` 的匿名段 + 实测 15/15 张表启用 | 等价 |

### 0.4.2 阶段 1 的实际证据清单

**A. 自动化检查（`npm run ci`，退出码 0）**

| 证据 | 证明什么 | 覆盖的需求 |
|---|---|---|
| `tests/unit/dependency-pinning.test.ts`（35 条） | 依赖版本被精确锁定，无浮动范围 | SEC-20、架构规则 |
| `tests/unit/no-third-party-assets.test.ts`（10 条） | 代码与产物中无境外资源引用 | 5.1、5.4 |
| `npm run check:no-third-party` | **构建产物**（浏览器实际下载的 JS/CSS）与 SSR HTML 中无禁用域名；且**反向确认**检查未空转 | 5.1、5.4 |
| `npm run check:browser-no-auth-service` | 浏览器端产物中**零**认证调用、**零** Supabase 域名；服务端有（反向确认） | ADR-0007、5.2 |
| `npm run check:server-only` | 客户端组件引用 service-role 客户端会让**构建失败** | SEC-10、SEC-18 |
| `tests/unit/env.test.ts`（16 条） | 缺必需变量时启动失败且不打印变量值；`.env.example` 只含变量名 | SEC-19、SEC-20 |
| `tests/unit/middleware-matcher.test.ts`（15 条） | 中间件不拦截静态资源，拦截受保护前缀 | RT-* |
| `tests/unit/roles.test.ts`（11 条） | 角色→落地页与区域权限的映射一致（不能跳到进不去的区域） | PERM-*、§4 |
| `tests/unit/auth-actions-wiring.test.ts`（5 条） | 限流在调用认证服务**之前**执行（顺序断言） | SEC-16 |
| `tests/unit/app-shell.test.tsx` / `state-panel.test.tsx`（20 条） | 地标结构、跳过导航、五种状态、`role="alert"` | §13 可访问性 |

**B. 数据库断言（`npm run db:verify`，退出码 0，共 70 条）**

| 段落 | 条数 | 覆盖的需求 |
|---|---:|---|
| 授权（允许 14 + 拒绝 22） | 36 | SEC-01…SEC-11、PERM-01、PERM-D* |
| 约束（UNIQUE / CHECK / 触发器 / 外键） | 11 | 数据完整性、边界情况 |
| 匿名访问（逐表拒绝） | 14 | SEC-01、F-ALL-05 |
| 频率限制 | 9 | SEC-16 |

> 拒绝用例的编号（`F-STU-*`、`F-COA-*`、`F-MGR-*`、`F-ALL-*`、`C*`）与
> `docs/permissions.md` 第 6 节逐条对应，覆盖状态见该文档 §6.0。

**C. 端到端实测（手工执行，结果见完成报告第 5.3 节）**

| 验证 | 结果 |
|---|---|
| 角色访问矩阵（五种角色 × 六个区域，真实会话） | 30 条断言**全部通过** |
| 未登录访问六个受保护前缀 | 真正的 **307 → /login** |
| 认证邮件链接 | 指向**自有域名**；真实 token → 307 + 会话 cookie |
| 容器内健康检查 | **200**，`database: ok` |
| 容器内带会话访问 `/dashboard` | **307 → /student** |
| 六项"故意制造错误"的门禁反向验证 | 门禁**全部按预期失败**，还原后恢复 |

### 0.4.3 阶段 1 尚未覆盖的需求行

阶段 1 只交付地基，因此本表中大量行属于**后续阶段**。阶段 1 结束时**尚未覆盖**的主要是：

- 所有与 `participations`、`partner_requests`、`matches`、`ballots`、`coach_notes`、
  `judge_event_availability`、`judge_assignments`、`match_roster_snapshots`、`email_jobs`
  相关的行——这些表尚未创建（Phase 3–9）。
- 与事件生命周期、配对、选票生命周期、通知相关的流程行。

逐条状态见 `docs/permissions.md` §6.0（38 条拒绝用例中 15 条已覆盖、23 条待覆盖）
与 `docs/phase-1-completion-report.md` 第 7 节的 L-4。

---

## 1. 成功标准（来源：1.1）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| SC-01 | 员工不再需要逐个联系学生收集每周出勤 | 1.1 | 阶段 3 + 阶段 9 | E2E `tests/e2e/eventSetup.spec.ts` + `tests/e2e/studentRegistration.spec.ts`（报名与通知自动送达）；手工依赖邮件确认 |
| SC-02 | 管理员可以在一个系统内创建并运营一个事件 | 1.1 | 阶段 2 | E2E `tests/e2e/eventSetup.spec.ts`；集成 `tests/integration/database/auditTrail.test.ts` |
| SC-03 | 学生无需员工协助即可完成报名与签到 | 1.1 | 阶段 3 + 阶段 6 | E2E `tests/e2e/studentRegistration.spec.ts`（含签到步骤）；RLS `tests/integration/rls/student.rls.test.ts` |
| SC-04 | 系统能为每一个已启用格式提出可用的队伍与比赛 | 1.1 | 阶段 4 + 阶段 5 | 单元 `tests/unit/pairing/teamFormation.test.ts`、`matchFormation.test.ts`（五种格式 fixture）；E2E `tests/e2e/pairingPublish.spec.ts` |
| SC-05 | 临时例外可以被人工修正，且不破坏历史记录 | 1.1 | 阶段 4、5、6（符合 10.7） | 单元 `tests/unit/pairing/regeneration.test.ts`、`ironman.test.ts`；集成 `tests/integration/database/auditTrail.test.ts`；E2E `tests/e2e/exceptionScenarios.spec.ts` |
| SC-06 | 裁判可以开始一场辩论并提交完整选票 | 1.1 | 阶段 6 + 阶段 7 | E2E `tests/e2e/judgeBallot.spec.ts`；单元 `tests/unit/ballots/templateValidation.test.ts` |
| SC-07 | 管理员可以看到哪些房间缺人、就绪、已开始或缺少选票 | 1.1 | 阶段 6（计数）+ 阶段 7（缺选票） | E2E `tests/e2e/livePublishBallot.spec.ts`；组件测试覆盖实时面板五种状态 |
| SC-08 | 学生与教练可以可靠地事后取回已发布选票 | 1.1 | 阶段 8 | E2E `tests/e2e/studentPublishedBallot.spec.ts`、`tests/e2e/coachNotes.spec.ts`；RLS `student.rls.test.ts`、`coach.rls.test.ts` |
| SC-09 | 权限对每一个角色都被强制执行并经过测试 | 1.1 | 阶段 1（基础框架）+ 之后每个阶段 | RLS `tests/integration/rls/*.rls.test.ts`（五个角色各一个文件，含显式拒绝）；单元 `tests/unit/permissions/capabilityHelpers.test.ts` |
| SC-10 | 中国大陆测试用户可在普通固网与移动网络上、无需 VPN 地加载、登录、报名、签到、打开选票 | 1.1（细化于 5.4） | 阶段 0（证明）+ 阶段 10（发布矩阵） | `连通性`；记录于 `docs/deployment-regions.md`；手工执行，不可由 CI 代替 |
| SC-11 | 托管区域、数据位置、外部依赖、月成本、备份状态与大陆访问测试结果都已为非技术负责人记录 | 1.1（细化于 5.4、15） | 阶段 0 + 阶段 10 | `文档复核` `docs/deployment-regions.md`；确认包含日期、城市、ISP、设备、结果与脱敏证据 |

---

## 2. 学生用户故事（来源：3.1）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| STU-01 | 学生可以创建账号、登录、重置密码并维护基本资料 | 3.1 | 阶段 1 | E2E `tests/e2e/superAdminProvisioning.spec.ts` 的前置登录流程 + 手工验收；RLS `tests/integration/rls/student.rls.test.ts`（可读写自己的 `profiles`） |
| STU-02 | 学生可以看到开放的事件，并且每个事件只能报名一次 | 3.1 | 阶段 3 | E2E `tests/e2e/studentRegistration.spec.ts`；集成 `tests/integration/database/constraints.test.ts`（唯一约束）；RLS 拒绝重复报名 |
| STU-03 | 学生只能从"合格且该事件已启用"的格式中选择或排序格式偏好 | 3.1（规则见 6.3） | 阶段 3 | 单元 `tests/unit/domain/eligibility.test.ts`；RLS `student.rls.test.ts` 拒绝未启用格式的偏好写入 |
| STU-04 | 学生可以请求搭档，并可以回应他人的搭档请求 | 3.1 | 阶段 3 | E2E `tests/e2e/studentRegistration.spec.ts`；集成 `tests/integration/database/constraints.test.ts`（同一 requester/event/format 最多一条有效请求） |
| STU-05 | 学生可以取消报名，系统能区分"及时取消"与"迟到取消" | 3.1（规则见 9.2） | 阶段 3 | 单元 `tests/unit/domain/deadlines.test.ts`；E2E `tests/e2e/studentRegistration.spec.ts` 覆盖截止前/后两种路径 |
| STU-06 | 学生可以在签到窗口内签到 | 3.1（规则见 9.4） | 阶段 6 | E2E `tests/e2e/studentRegistration.spec.ts`；单元 `tests/unit/domain/deadlines.test.ts`（窗口 = 开始前 30 分钟） |
| STU-07 | 学生可以看到已确认的队伍、对手、边/位、房间/链接、裁判以及裁判范式 | 3.1 | 阶段 5 | E2E `tests/e2e/pairingPublish.spec.ts`；RLS `student.rls.test.ts`（只能读自己的分配） |
| STU-08 | 学生能收到邮件与站内的事件提醒和分配更新 | 3.1（清单见 12） | 阶段 9（触发点分布在阶段 3、5、6、7） | 单元 `tests/unit/notifications/dedupeKey.test.ts`；集成 `tests/integration/database/idempotency.test.ts`（`email_jobs`）；E2E 断言站内通知出现 |
| STU-09 | 学生可以查看参与历史与已发布选票 | 3.1 | 阶段 8 | E2E `tests/e2e/studentPublishedBallot.spec.ts`；RLS `student.rls.test.ts` |
| STU-10 | 学生对一张已发布选票只能提交一次复核请求 | 3.1（唯一约束见 6.6） | 阶段 8 | E2E `tests/e2e/studentPublishedBallot.spec.ts`；集成 `tests/integration/database/constraints.test.ts`（`UNIQUE (ballot_id, requested_by_student_id)`） |
| STU-11 | 学生**绝不能**看到草稿/未发布的选票 | 3.1 | 阶段 1（RLS 基础）+ 阶段 7 | RLS `tests/integration/rls/student.rls.test.ts`：`it('denies a student reading a draft or submitted but unpublished ballot')`；E2E `studentPublishedBallot.spec.ts` 断言发布前访问得到安全空态/403 |
| STU-12 | 学生**绝不能**看到教练笔记 | 3.1 | 阶段 1 + 阶段 8 | RLS `student.rls.test.ts`：`it('denies a student reading coach_notes')`；E2E `tests/e2e/coachNotes.spec.ts` |
| STU-13 | 学生**绝不能**看到其他学生的私人资料 | 3.1 | 阶段 1 | RLS `student.rls.test.ts`：`it('denies a student reading another student profiles row')` |
| STU-14 | 学生**绝不能**看到管理审计数据 | 3.1 | 阶段 1 + 阶段 2 | RLS `student.rls.test.ts`：`it('denies a student reading audit_logs')` |

---

## 3. 裁判用户故事（来源：3.2）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| JDG-01 | 裁判可以注册账号并维护个人资料/裁判范式（paradigm） | 3.2 | 阶段 1（账号与资料）+ 阶段 8（范式经验） | E2E `tests/e2e/judgeBallot.spec.ts` 前置；RLS `tests/integration/rls/judge.rls.test.ts` 允许更新自己的 `judge_profiles` |
| JDG-02 | 裁判可以为一个事件声明可用性（availability） | 3.2（状态值见 6.5） | 阶段 5 | E2E `tests/e2e/judgeBallot.spec.ts`；集成 `tests/integration/database/constraints.test.ts`（`UNIQUE (event_id, judge_id)`） |
| JDG-03 | 裁判可以看到自己的审批状态与指派状态 | 3.2 | 阶段 5 | E2E `tests/e2e/judgeBallot.spec.ts`（未批准时看不到分配）；组件测试覆盖状态展示（文字+图标，不只靠颜色） |
| JDG-04 | 裁判只能查看被指派给自己的比赛名册与相关事件信息 | 3.2 | 阶段 5 | RLS `judge.rls.test.ts`：`it('denies a judge reading an unassigned match or its roster')` |
| JDG-05 | 裁判可以签到/表示已就绪 | 3.2 | 阶段 6 | E2E `tests/e2e/livePublishBallot.spec.ts`；单元 `tests/unit/judges/judgeRanking.test.ts` 验证"就绪"是否作为候选条件（语义待第 17 节确认） |
| JDG-06 | 裁判可以开始被指派的辩论，记录时间并锁定名册 | 3.2（事务见 9.4） | 阶段 6 | E2E `tests/e2e/judgeBallot.spec.ts`；集成 `tests/integration/database/idempotency.test.ts`：`it('starts a debate once and writes exactly one roster snapshot set for two concurrent Start Debate calls')` |
| JDG-07 | 裁判可以保存选票草稿 | 3.2 | 阶段 7 | E2E `tests/e2e/judgeBallot.spec.ts`；组件测试覆盖"明确的保存草稿动作"与自动保存安全性（13 节） |
| JDG-08 | 只有当该格式的全部必填字段通过校验时，裁判才能提交选票 | 3.2（规则见 9.5） | 阶段 7 | 单元 `tests/unit/ballots/templateValidation.test.ts`；E2E `judgeBallot.spec.ts` 断言缺字段时提交被拒并显示行内错误 |
| JDG-09 | 已提交的选票，只有管理员重开后裁判才能编辑 | 3.2（生命周期见 9.5） | 阶段 7 | 单元 `tests/unit/domain/stateTransitions.test.ts`；RLS `judge.rls.test.ts`：`it('denies a judge updating a submitted ballot without a reopen')`；E2E `livePublishBallot.spec.ts` |
| JDG-10 | 裁判可以查看自己的执裁历史 | 3.2 | 阶段 8 | E2E `tests/e2e/judgeBallot.spec.ts` 收尾断言；RLS `judge.rls.test.ts` |
| JDG-11 | 裁判**不能**把自己指派给比赛 | 3.2 | 阶段 5 | RLS `judge.rls.test.ts`：`it('denies a judge creating a judge_assignment row for themselves')` |
| JDG-12 | 裁判**不能**发布选票 | 3.2 | 阶段 7 | RLS `judge.rls.test.ts`：`it('denies a judge setting ballots.status to published')`；单元 `tests/unit/permissions/capabilityHelpers.test.ts` |
| JDG-13 | 裁判**不能**在自己被重开的选票之外更改结果 | 3.2 | 阶段 7 | RLS `judge.rls.test.ts` 拒绝越权更新；集成 `tests/integration/database/auditTrail.test.ts`（仅重开路径允许变更） |
| JDG-14 | 裁判**不能**访问无关的学生记录 | 3.2 | 阶段 1 + 阶段 8 | RLS `judge.rls.test.ts`：`it('denies a judge reading unrelated student profiles, coach_notes or audit_logs')` |

---

## 4. 教练用户故事（来源：3.3）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| COA-01 | 教练可以在管理员许可的范围内浏览学生资料、参与历史与已发布选票 | 3.3 | 阶段 8 | RLS `tests/integration/rls/coach.rls.test.ts`（允许）；E2E `tests/e2e/coachNotes.spec.ts` |
| COA-02 | 获得该运营权限时，教练可以维护按格式区分的资格与评分 | 3.3（与 4 节"If permitted"、17 节待确认项冲突，见第 15 节 A-01） | 阶段 8 | RLS `coach.rls.test.ts`：`it('denies a coach updating student_format_profiles.rating when not granted the operational permission')` 及其正面对照（期望值待确认后冻结） |
| COA-03 | 教练可以创建和编辑私人教练笔记 | 3.3 | 阶段 8 | E2E `tests/e2e/coachNotes.spec.ts`；RLS `coach.rls.test.ts` 允许写自己的 `coach_notes` |
| COA-04 | 教练可以看到每周学生参与汇总 | 3.3 | 阶段 8 | E2E `tests/e2e/coachNotes.spec.ts`；组件测试覆盖空/加载/错误状态 |
| COA-05 | V1 不实现"教练-学生归属关系"；教练访问是**基于角色**并由管理策略控制的 | 3.3 | 阶段 1（RLS 基础）+ 阶段 8 | RLS `coach.rls.test.ts`（无 ownership 表参与判断）；`文档复核` 确认未引入 ownership 模型（AGENTS.md Scope Discipline） |
| COA-06 | 教练笔记对**学生与裁判永远不可见** | 3.3（与 7 节一致） | 阶段 8 | RLS `coach.rls.test.ts`、`student.rls.test.ts`、`judge.rls.test.ts` 三方拒绝断言；E2E `coachNotes.spec.ts` |

---

## 5. 俱乐部经理用户故事（来源：3.4）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| MGR-01 | 经理可以创建、克隆、编辑并运营事件 | 3.4 | 阶段 2 | E2E `tests/e2e/eventSetup.spec.ts`；RLS `tests/integration/rls/clubManager.rls.test.ts` |
| MGR-02 | 经理可以启用格式并发布通知（notices） | 3.4 | 阶段 2 | E2E `tests/e2e/eventSetup.spec.ts`；集成 `tests/integration/database/constraints.test.ts`（`notices` 的受众目标列约束） |
| MGR-03 | 经理可以管理报名并执行人工签到 | 3.4 | 阶段 3（报名）+ 阶段 6（签到） | E2E `tests/e2e/studentRegistration.spec.ts`、`exceptionScenarios.spec.ts`；集成 `tests/integration/database/auditTrail.test.ts`（人工签到必须留审计） |
| MGR-04 | 经理可以复核迟到取消与未到场（no-show） | 3.4 | 阶段 3 | E2E `tests/e2e/exceptionScenarios.spec.ts`；单元 `tests/unit/domain/deadlines.test.ts` |
| MGR-05 | 经理可以生成、编辑、确认并发布队伍/比赛提案 | 3.4 | 阶段 4（队伍）+ 阶段 5（比赛） | E2E `tests/e2e/pairingPublish.spec.ts`；单元 `tests/unit/pairing/regeneration.test.ts` |
| MGR-06 | 经理可以在比赛开始前把参与者移动到其他队伍或比赛 | 3.4（规则见 10.7） | 阶段 6 | E2E `tests/e2e/exceptionScenarios.spec.ts`；集成 `tests/integration/database/idempotency.test.ts`（并发移动一致性）；审计测试 |
| MGR-07 | 经理可以审批裁判可用性并确认指派 | 3.4（逻辑见 11） | 阶段 5 | E2E `tests/e2e/pairingPublish.spec.ts`；单元 `tests/unit/judges/judgeRanking.test.ts` |
| MGR-08 | 经理可以监控实时房间就绪状态以及超时未开始/超时未交选票 | 3.4 | 阶段 6 + 阶段 7 | E2E `tests/e2e/livePublishBallot.spec.ts`、`exceptionScenarios.spec.ts` |
| MGR-09 | 经理可以重开、复核并发布选票 | 3.4（生命周期见 9.5） | 阶段 7 | E2E `tests/e2e/livePublishBallot.spec.ts`；RLS `clubManager.rls.test.ts` 允许重开与发布；审计测试 |
| MGR-10 | 经理可以处理选票复核请求 | 3.4 | 阶段 8 | E2E `tests/e2e/studentPublishedBallot.spec.ts`（学生提交 → 经理解决）；集成 `tests/integration/database/auditTrail.test.ts` |
| MGR-11 | 经理可以查看审计日志，但不能编辑或删除 | 3.4 | 阶段 2 | RLS `clubManager.rls.test.ts`：允许 `SELECT`，拒绝 `UPDATE`/`DELETE`（配合 service-role 回读证明数据未变） |
| MGR-12 | 经理**不能**授予 `super_admin` | 3.4 | 阶段 2 | RLS `clubManager.rls.test.ts`：`it('denies a club manager inserting a super_admin row into user_roles')`（期望 SQLSTATE `42501`） |
| MGR-13 | 经理**不能**更改系统级安全配置 | 3.4 | 阶段 2 | RLS `clubManager.rls.test.ts`：`it('denies a club manager changing system-wide security settings')` |
| MGR-14 | 经理**不能**编辑或删除审计记录 | 3.4（与 7 节一致） | 阶段 2 | RLS `clubManager.rls.test.ts`：`it('denies a club manager updating or deleting any audit_logs row')`；E2E 确认界面上没有该操作入口 |

---

## 6. 超级管理员用户故事（来源：3.5）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| ADM-01 | 超级管理员可以管理用户状态与角色授予 | 3.5 | 阶段 2 | E2E `tests/e2e/superAdminProvisioning.spec.ts`；RLS `tests/integration/rls/superAdmin.rls.test.ts`（允许授予/撤销） |
| ADM-02 | 超级管理员可以批准/停用裁判并维护裁判资格 | 3.5 | 阶段 2 | E2E `superAdminProvisioning.spec.ts`；RLS `superAdmin.rls.test.ts` 允许写 `judge_format_qualifications`、`debate_formats` |
| ADM-03 | 超级管理员可以管理辩论格式与系统设置 | 3.5 | 阶段 2 | E2E `superAdminProvisioning.spec.ts`；`迁移` 断言种子格式（PF/JWSD/WSDC/BP/ONE_V_ONE 及其人数配置） |
| ADM-04 | 超级管理员可以授予教练/经理角色 | 3.5 | 阶段 2 | E2E `superAdminProvisioning.spec.ts`；RLS `superAdmin.rls.test.ts` |
| ADM-05 | 超级管理员可以访问全部运营与审计数据 | 3.5 | 阶段 2 | RLS `superAdmin.rls.test.ts`：`it('lets a super admin read all operational and audit data')` |
| ADM-06 | 任何用户（包括超级管理员）**都不能**通过普通应用更新或删除审计日志行 | 3.5（与 6.7、7 节一致） | 阶段 2 | RLS `superAdmin.rls.test.ts`：`it('denies even a super admin updating or deleting an audit_logs row through the application API')`；`serviceRoleBoundary.test.ts` 确认 service-role 未暴露给客户端 |

---

## 7. 权限矩阵（来源：4）

### 7.1 能力行（每行给出五个角色的完整授予/拒绝模式）

图例（来自主规格第 4 节）：`Own` = 自己的记录；`Assigned` = 被指派给自己的比赛；`Published` = 不含草稿；`Manage` = 在流程规则允许范围内创建/更新。

| 需求编号 | 需求描述（学生 / 裁判 / 教练 / 经理 / 超管） | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PERM-01 | 编辑自己的基本资料：Yes / Yes / Yes / Yes / Yes | 4 | 阶段 1 | RLS 五个角色文件各自允许读写自己的 `profiles`；E2E 资料页 |
| PERM-02 | 自助报名开放事件：Own / 裁判可用性 / No / Manage / Manage | 4 | 阶段 3 + 阶段 5 | RLS `student.rls.test.ts`（学生仅自己）、`judge.rls.test.ts`（裁判仅可用性）；拒绝项见 PERM-D01 |
| PERM-03 | 学生签到：Own / No / No / Manage / Manage | 4 | 阶段 6 | RLS `student.rls.test.ts`（自己）、`clubManager.rls.test.ts`（人工签到）；拒绝项见 PERM-D02、PERM-D03 |
| PERM-04 | 查看已确认的分配：Own / Assigned / Yes / All / All | 4 | 阶段 5 | RLS `student.rls.test.ts`、`judge.rls.test.ts`、`coach.rls.test.ts`、`clubManager.rls.test.ts`、`superAdmin.rls.test.ts` |
| PERM-05 | 查看裁判范式：自己那场 / 自己的 / Yes / All / All | 4 | 阶段 5 | RLS 五个角色文件；E2E `tests/e2e/pairingPublish.spec.ts` 断言学生能看到本场裁判范式 |
| PERM-06 | 维护学生资格/评分：No / No / 若被授权 / Yes / Yes | 4（与 3.3、17 节冲突，见第 15 节 A-01） | 阶段 2（管理员）+ 阶段 8（教练，权限待确认） | RLS `clubManager.rls.test.ts`、`superAdmin.rls.test.ts` 允许；`student`/`judge` 拒绝见 PERM-D04、PERM-D05；教练用例期望值待确认后冻结 |
| PERM-07 | 创建队伍/比赛提案：No / No / No / Yes / Yes | 4 | 阶段 4 | 单元 `tests/unit/pairing/*`（仅经理/超管路径可达）；RLS 拒绝见 PERM-D06、D07、D08；E2E `pairingPublish.spec.ts` |
| PERM-08 | 确认/移动队伍或比赛：No / No / No / Yes / Yes | 4 | 阶段 4 + 阶段 6 | E2E `pairingPublish.spec.ts`、`exceptionScenarios.spec.ts`；RLS 拒绝见 PERM-D09、D10、D11 |
| PERM-09 | 审批/指派裁判：No / No / No / Yes / Yes | 4 | 阶段 5 | E2E `pairingPublish.spec.ts`；RLS 拒绝见 PERM-D12、D13、D14 |
| PERM-10 | 开始比赛：No / Assigned / No / 紧急绕过 / 紧急绕过 | 4（流程见 9.4；"紧急绕过"细节未定义，见第 15 节 A-07） | 阶段 6 | E2E `judgeBallot.spec.ts`；集成 `idempotency.test.ts`（开赛只落一次）；RLS 拒绝见 PERM-D15、D16 |
| PERM-11 | 起草/提交选票：No / Assigned / No / No / No | 4 | 阶段 7 | 单元 `templateValidation.test.ts`；RLS `judge.rls.test.ts` 允许被指派裁判；拒绝见 PERM-D17..D20 |
| PERM-12 | 重开选票：No / No / No / Yes / Yes | 4 | 阶段 7 | E2E `livePublishBallot.spec.ts`；RLS 拒绝见 PERM-D21、D22、D23；审计测试 |
| PERM-13 | 发布选票：No / No / No / Yes / Yes | 4 | 阶段 7 | E2E `livePublishBallot.spec.ts`；集成 `idempotency.test.ts`（发布只一次）；RLS 拒绝见 PERM-D24、D25、D26 |
| PERM-14 | 查看选票：Published 且自己 / 自己的 / Published / All / All | 4 | 阶段 7 + 阶段 8 | RLS `student.rls.test.ts`、`judge.rls.test.ts`、`coach.rls.test.ts`；E2E `studentPublishedBallot.spec.ts` |
| PERM-15 | 请求选票复核：Own / No / No / 查看并处理 / 查看并处理 | 4 | 阶段 8 | E2E `studentPublishedBallot.spec.ts`；RLS 拒绝见 PERM-D27、D28 |
| PERM-16 | 私人教练笔记：No / No / Manage / 查看 / Manage | 4 | 阶段 8 | RLS `coach.rls.test.ts`；拒绝见 PERM-D29、D30；E2E `coachNotes.spec.ts` |
| PERM-17 | 发布通知：No / No / No / Manage / Manage | 4 | 阶段 2 | E2E `eventSetup.spec.ts`；RLS 拒绝见 PERM-D31、D32、D33 |
| PERM-18 | 授予管理角色：No / No / No / No / Yes | 4 | 阶段 2 | E2E `superAdminProvisioning.spec.ts`；RLS 拒绝见 PERM-D34..D37；单元 `capabilityHelpers.test.ts` |
| PERM-19 | 查看审计日志：No / No / No / Yes / Yes | 4 | 阶段 2 | RLS `clubManager.rls.test.ts`、`superAdmin.rls.test.ts` 允许；拒绝见 PERM-D38、D39、D40 |
| PERM-20 | 篡改审计日志：No / No / No / No / No | 4（与 6.7、7 节一致） | 阶段 2 | RLS 全部拒绝见 PERM-D41..D45；`tests/integration/rls/serviceRoleBoundary.test.ts` |
| PERM-21 | 授权规则必须在 PostgreSQL RLS 中实现，并在受信任的服务端动作中再次校验；客户端路由守卫只是易用性层，不是安全措施 | 4 | 阶段 1 起，之后每个阶段 | RLS `tests/integration/rls/*`（数据库边界）+ `tests/integration/actions/*`（服务端二次校验）+ `serviceRoleBoundary.test.ts`（客户端不得持有特权客户端）+ `静态`（导入边界检查） |

### 7.2 显式拒绝行（矩阵中每一个 "No" 单元格；这些同样必须被验证）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PERM-D01 | 教练**不得**自助报名开放事件 | 4 | 阶段 3 | RLS `tests/integration/rls/coach.rls.test.ts` 拒绝写 `registrations` |
| PERM-D02 | 裁判**不得**执行学生签到 | 4 | 阶段 6 | RLS `judge.rls.test.ts` 拒绝更新 `registrations.checked_in_at` |
| PERM-D03 | 教练**不得**执行学生签到 | 4 | 阶段 6 | RLS `coach.rls.test.ts` 拒绝更新 `registrations` |
| PERM-D04 | 学生**不得**维护学生资格/评分 | 4 | 阶段 2 | RLS `student.rls.test.ts` 拒绝写 `student_format_profiles` |
| PERM-D05 | 裁判**不得**维护学生资格/评分 | 4 | 阶段 2 | RLS `judge.rls.test.ts` 拒绝写 `student_format_profiles` |
| PERM-D06 | 学生**不得**创建队伍/比赛提案 | 4 | 阶段 4 | RLS `student.rls.test.ts` 拒绝写 `teams`/`matches` |
| PERM-D07 | 裁判**不得**创建队伍/比赛提案 | 4 | 阶段 4 | RLS `judge.rls.test.ts` 拒绝写 `teams`/`matches` |
| PERM-D08 | 教练**不得**创建队伍/比赛提案 | 4 | 阶段 4 | RLS `coach.rls.test.ts` 拒绝写 `teams`/`matches` |
| PERM-D09 | 学生**不得**确认/移动队伍或比赛 | 4 | 阶段 4 | RLS `student.rls.test.ts` 拒绝更新 `teams.status`/`match_teams` |
| PERM-D10 | 裁判**不得**确认/移动队伍或比赛 | 4 | 阶段 4 | RLS `judge.rls.test.ts` 拒绝更新 `match_teams` |
| PERM-D11 | 教练**不得**确认/移动队伍或比赛 | 4 | 阶段 4 | RLS `coach.rls.test.ts` 拒绝更新 `match_teams` |
| PERM-D12 | 学生**不得**审批/指派裁判 | 4 | 阶段 5 | RLS `student.rls.test.ts` 拒绝写 `judge_assignments` |
| PERM-D13 | 裁判**不得**审批/指派裁判（含不得指派自己，见 JDG-11） | 4 | 阶段 5 | RLS `judge.rls.test.ts` 拒绝写 `judge_assignments` |
| PERM-D14 | 教练**不得**审批/指派裁判 | 4 | 阶段 5 | RLS `coach.rls.test.ts` 拒绝写 `judge_assignments` |
| PERM-D15 | 学生**不得**开始比赛 | 4 | 阶段 6 | RLS `student.rls.test.ts` 拒绝更新 `matches.status`/`started_at` |
| PERM-D16 | 教练**不得**开始比赛（紧急绕过仅限经理/超管） | 4 | 阶段 6 | RLS `coach.rls.test.ts` 拒绝更新 `matches.status` |
| PERM-D17 | 学生**不得**起草或提交选票 | 4 | 阶段 7 | RLS `student.rls.test.ts` 拒绝写 `ballots` |
| PERM-D18 | 教练**不得**起草或提交选票 | 4 | 阶段 7 | RLS `coach.rls.test.ts` 拒绝写 `ballots` |
| PERM-D19 | 俱乐部经理**不得**起草或提交选票（只能重开/复核/发布） | 4（与 9.5 的"展示性笔误"存在张力，见第 15 节 A-03） | 阶段 7 | RLS `clubManager.rls.test.ts`：`it('denies a club manager drafting or submitting a ballot as a judge')` |
| PERM-D20 | 超级管理员**不得**以裁判身份起草或提交选票 | 4 | 阶段 7 | RLS `superAdmin.rls.test.ts` 拒绝以裁判身份写 `ballots` |
| PERM-D21 | 学生**不得**重开选票 | 4 | 阶段 7 | RLS `student.rls.test.ts` 拒绝更新 `ballots.status` 为 `reopened` |
| PERM-D22 | 裁判**不得**重开选票（只能等待管理员重开） | 4 | 阶段 7 | RLS `judge.rls.test.ts` 拒绝自行把状态改为 `reopened` |
| PERM-D23 | 教练**不得**重开选票 | 4 | 阶段 7 | RLS `coach.rls.test.ts` 拒绝更新 `ballots.status` |
| PERM-D24 | 学生**不得**发布选票 | 4 | 阶段 7 | RLS `student.rls.test.ts` 拒绝把 `ballots.status` 设为 `published` |
| PERM-D25 | 裁判**不得**发布选票 | 4 | 阶段 7 | RLS `judge.rls.test.ts`：`it('denies a judge setting ballots.status to published')` |
| PERM-D26 | 教练**不得**发布选票 | 4 | 阶段 7 | RLS `coach.rls.test.ts`：`it('denies a coach updating ballots.status to published')` |
| PERM-D27 | 裁判**不得**提出选票复核请求（复核请求只属于学生） | 4 | 阶段 8 | RLS `judge.rls.test.ts` 拒绝写 `ballot_review_requests` |
| PERM-D28 | 教练**不得**提出选票复核请求 | 4 | 阶段 8 | RLS `coach.rls.test.ts` 拒绝写 `ballot_review_requests` |
| PERM-D29 | 学生**不得**查看私人教练笔记 | 4 | 阶段 8 | RLS `student.rls.test.ts`：`it('denies a student reading coach_notes')` |
| PERM-D30 | 裁判**不得**查看私人教练笔记 | 4 | 阶段 8 | RLS `judge.rls.test.ts`：`it('denies a judge reading … coach_notes …')` |
| PERM-D31 | 学生**不得**发布通知 | 4 | 阶段 2 | RLS `student.rls.test.ts` 拒绝写 `notices` |
| PERM-D32 | 裁判**不得**发布通知 | 4 | 阶段 2 | RLS `judge.rls.test.ts` 拒绝写 `notices` |
| PERM-D33 | 教练**不得**发布通知 | 4 | 阶段 2 | RLS `coach.rls.test.ts` 拒绝写 `notices` |
| PERM-D34 | 学生**不得**授予管理角色 | 4 | 阶段 2 | RLS `student.rls.test.ts` 拒绝写 `user_roles` |
| PERM-D35 | 裁判**不得**授予管理角色 | 4 | 阶段 2 | RLS `judge.rls.test.ts` 拒绝写 `user_roles` |
| PERM-D36 | 教练**不得**授予管理角色 | 4 | 阶段 2 | RLS `coach.rls.test.ts`：`it('denies a coach inserting into user_roles for any role')` |
| PERM-D37 | 俱乐部经理**不得**授予管理角色（尤其 `super_admin`） | 4 | 阶段 2 | RLS `clubManager.rls.test.ts`：`it('denies a club manager inserting a super_admin row into user_roles')` |
| PERM-D38 | 学生**不得**查看审计日志 | 4 | 阶段 2 | RLS `student.rls.test.ts`：`it('denies a student reading audit_logs')` |
| PERM-D39 | 裁判**不得**查看审计日志 | 4 | 阶段 2 | RLS `judge.rls.test.ts` 拒绝读 `audit_logs` |
| PERM-D40 | 教练**不得**查看审计日志 | 4 | 阶段 2 | RLS `coach.rls.test.ts`：`it('denies a coach reading audit_logs')` |
| PERM-D41 | 学生**不得**篡改（更新/删除）审计日志 | 4 | 阶段 2 | RLS `student.rls.test.ts`：`UPDATE`/`DELETE` 影响 0 行 + service-role 回读确认未变 |
| PERM-D42 | 裁判**不得**篡改审计日志 | 4 | 阶段 2 | RLS `judge.rls.test.ts` 同上断言形态 |
| PERM-D43 | 教练**不得**篡改审计日志 | 4 | 阶段 2 | RLS `coach.rls.test.ts` 同上断言形态 |
| PERM-D44 | 俱乐部经理**不得**篡改审计日志 | 4 | 阶段 2 | RLS `clubManager.rls.test.ts`：`it('denies a club manager updating or deleting any audit_logs row')` |
| PERM-D45 | 超级管理员**不得**篡改审计日志 | 4 | 阶段 2 | RLS `superAdmin.rls.test.ts`：`it('denies even a super admin updating or deleting an audit_logs row through the application API')` |

---

## 8. 安全与 RLS 要求（来源：7，以及 5.3）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| SEC-01 | 对每一张通过 Supabase 暴露的表启用 RLS，默认拒绝 | 7 第 1 段 | 阶段 1（之后每个阶段的新表同样适用） | RLS `tests/integration/rls/anonymous.rls.test.ts`：`it('denies an anonymous visitor every table that is not explicitly public')`；`迁移` 断言每张暴露表均已 `ENABLE ROW LEVEL SECURITY` |
| SEC-02 | 使用 `has_role(role)`、`is_manager()` 等小助手函数，实现为经过审查的 `SECURITY DEFINER` 函数并固定 `search_path` | 7 第 1 段 | 阶段 1 | `迁移` 断言函数存在、为 `SECURITY DEFINER` 且 `search_path` 固定；RLS 五个角色文件间接验证行为 |
| SEC-03 | 用户可以读/写自己的 `profiles` 行，但不能修改 `status` 或角色 | 7 | 阶段 1 | RLS `student.rls.test.ts`：允许读改自己；`it('denies a student changing profiles.status or inserting into user_roles')` |
| SEC-04 | 学生可在流程窗口内读/写自己的报名，并且只能读自己的参与/历史 | 7（窗口定义见 9.2） | 阶段 1 + 阶段 3 | RLS `student.rls.test.ts`：允许自己；拒绝他人；拒绝窗口外写入（`it('denies a student inserting a registration after registration_closes_at')`） |
| SEC-05 | 学生只有在选票已 `published` 且自己出现在该场名册上时才能读取 | 7 | 阶段 1 + 阶段 7 | RLS `student.rls.test.ts`：`it('denies a student reading a draft or submitted but unpublished ballot')`；E2E `studentPublishedBallot.spec.ts` |
| SEC-06 | 裁判可读被指派给自己的比赛，并可在合法生命周期状态下读/写自己的选票 | 7（生命周期见 9.5） | 阶段 5 + 阶段 7 | RLS `judge.rls.test.ts`：允许草稿阶段写；拒绝提交后未经重开的写 |
| SEC-07 | 教练可读学生运营/历史数据、可写自己的教练笔记；学生与裁判对教练笔记无任何访问权 | 7 | 阶段 8 | RLS `coach.rls.test.ts` + `student.rls.test.ts` + `judge.rls.test.ts` |
| SEC-08 | 经理可管理事件与运营数据，但只有超级管理员可以授予角色或维护系统级格式/裁判资格 | 7 | 阶段 2 | RLS `clubManager.rls.test.ts`（拒绝授权、拒绝写系统级配置）+ `superAdmin.rls.test.ts`（允许） |
| SEC-09 | 任何角色都不能通过应用 API 更新或删除 `audit_logs` | 7（表定义见 6.7） | 阶段 2 | RLS `superAdmin.rls.test.ts` 与 `clubManager.rls.test.ts` 的拒绝断言；PERM-D41..D45 |
| SEC-10 | service-role 的使用仅限服务端、范围最小化，绝不作为绕过授权的捷径 | 7 | 阶段 1 | `tests/integration/rls/serviceRoleBoundary.test.ts`：`it('confirms no client-reachable module imports the service-role client')` + `it('confirms service-role usage happens only in server-only modules')`；`静态` 导入边界检查 |
| SEC-11 | 安全测试必须尝试**被禁止**的读和写，而不只是确认允许的操作 | 7 第 1 段末句 | 阶段 1 起，每个阶段 | `文档复核` + 代码评审：每个 `*.rls.test.ts` 必须同时包含正面对照与拒绝断言（见 `docs/testing.md` 第 3.1 节）；CI 中作为评审检查项 |
| SEC-12 | 所有表单/Server Action/路由输入都用 Zod 校验 | 7 | 阶段 1 起 | `tests/integration/actions/*.test.ts` 覆盖非法输入被拒；`静态` 检查每个 Server Action 入口有校验；代码评审 |
| SEC-13 | 使用生成的类型化数据库定义 | 7 | 阶段 1 | `静态`（`tsc` 类型检查依赖生成类型）；`迁移` 生成物与代码一致；CI 检查生成物未过期 |
| SEC-14 | 安全地转义/渲染用户文本；绝不把选票反馈或通知作为原始 HTML 注入 | 7 | 阶段 2（通知）+ 阶段 7（选票） | 组件测试：含 `<script>` 的文本被当作纯文本渲染；代码评审确认未使用 `dangerouslySetInnerHTML` |
| SEC-15 | 生产日志不得记录手机号、邮件内容、认证 token 或选票内容 | 7 | 阶段 1 + 阶段 9 | `文档复核` 日志字段清单；集成测试断言错误路径返回的是安全用户消息且不含个人信息；代码评审 |
| SEC-16 | 对认证相关、复核请求和邮件触发端点做速率限制 | 7 | 阶段 9 | 集成 `tests/integration/actions/*.test.ts`：超过阈值返回限流错误；`手工` 复核阈值配置 |
| SEC-17 | 变更操作使用框架的 CSRF 安全约定，并在服务端校验已认证身份 | 7 | 阶段 1 | `tests/integration/actions/*.test.ts`：缺少/伪造身份时被拒；`静态` 确认未使用不安全的原生表单提交绕过 |
| SEC-18 | 特权变更函数保留在 server-only 模块中 | 7 | 阶段 1 起 | `静态`：`server-only` 标记与导入边界检查；`serviceRoleBoundary.test.ts` |
| SEC-19 | 启动时校验必需的服务端环境变量 | 5.3 | 阶段 1 | 集成/单元测试：缺少必需变量时启动失败并给出安全提示（不打印变量值）；`.env.example` 只含变量名 |
| SEC-20 | 密钥绝不提交、记录、返回客户端或写入文档 | 5.3 | 阶段 1 起，每个阶段 | `文档复核` diff 与 CI（密钥扫描工具需先经产品负责人批准，见 `docs/testing.md` 第 7 节第 8 条）；`.env.example` 审查 |

---

## 9. 路由访问控制（来源：8；本表补充纳入以便追溯）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| RT-01 | `/login`、`/register`、`/forgot-password`、`/reset-password` 为公开/认证路由，无需登录即可访问 | 8 | 阶段 1 | E2E `tests/e2e/studentRegistration.spec.ts` 前置流程；组件测试覆盖表单与错误状态 |
| RT-02 | 每一条角色范围的路由（`/student/*`、`/judge/*`、`/coach/*`、`/manage/*`、`/admin/*`）都必须在服务端检查访问权限 | 8 | 阶段 1（框架）+ 各阶段对应路由 | E2E 逐角色访问越权 URL；`tests/integration/actions/*` 服务端校验；`静态` 确认守卫在服务端而非仅客户端 |
| RT-03 | 未授权用户收到安全的 403/跳转，且**不泄漏**受保护记录是否存在 | 8 | 阶段 1 起 | E2E：比较"记录不存在"与"无权限"两种情况的响应与页面文案必须一致；手工验收清单第 6 项 |

---

## 10. 每周工作流与状态跳转（来源：9）

### 10.1 事件生命周期（9.1）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| WF-01 | 事件生命周期为 `draft → registration_open → registration_closed → pairing → ready → live → completed → archived` | 9.1 | 阶段 2（创建与基础跳转）+ 阶段 3–8（后续状态） | 单元 `tests/unit/domain/stateTransitions.test.ts`；E2E `tests/e2e/eventSetup.spec.ts` |
| WF-02 | 事件可以在完成前转为 `cancelled` | 9.1 | 阶段 2 | 单元 `stateTransitions.test.ts`；E2E `exceptionScenarios.spec.ts` |
| WF-03 | 非法跳转返回领域错误，并且不产生部分写入 | 9.1 | 阶段 2 | 单元 `tests/unit/domain/stateTransitions.test.ts`：`it('rejects an invalid transition and leaves no partial mutation')`；集成 `tests/integration/database/idempotency.test.ts` 的回滚断言 |

### 10.2 报名（9.2）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| WF-04 | 经理创建或克隆事件并启用格式 | 9.2 第 1 步 | 阶段 2 | E2E `tests/e2e/eventSetup.spec.ts`；集成 `constraints.test.ts`（`UNIQUE (event_id, format_id)`） |
| WF-05 | 经理开启报名；学生收到邮件/站内通知 | 9.2 第 2 步 | 阶段 2（状态）+ 阶段 9（通知） | E2E `eventSetup.spec.ts`（状态与站内通知）；单元 `dedupeKey.test.ts`（邮件去重） |
| WF-06 | 学生只能报名一次，并对合格格式排序偏好 | 9.2 第 3 步 | 阶段 3 | E2E `studentRegistration.spec.ts`；集成 `constraints.test.ts`（`UNIQUE (event_id, student_id)`、偏好排名唯一） |
| WF-07 | 学生可以请求搭档 | 9.2 第 4 步 | 阶段 3 | E2E `studentRegistration.spec.ts`；集成 `constraints.test.ts`（同一 requester/event/format 最多一条有效请求；`requester <> requested`） |
| WF-08 | 截止前取消记为 `cancelled`；截止后记为 `late_cancelled` | 9.2 第 5 步 | 阶段 3 | 单元 `tests/unit/domain/deadlines.test.ts`；E2E `studentRegistration.spec.ts` 两条路径 |
| WF-09 | 报名按时间戳自动关闭，即使计划任务尚未运行 | 9.2 第 6 步 | 阶段 3 | 单元 `deadlines.test.ts`（状态由时间戳派生）；集成测试：`events.status` 仍为 `registration_open` 时，截止后的报名写入仍被拒绝 |
| WF-10 | 经理在配对前复核未解决的资格/偏好问题 | 9.2 第 7 步 | 阶段 3（视图）+ 阶段 4（配对前检查） | E2E `studentRegistration.spec.ts` 的管理员视图；组件测试覆盖警告列表 |

### 10.3 配对与比赛发布（9.3）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| WF-11 | 系统为参与（participation）与队伍生成**确定性**提案 | 9.3 第 1 步 | 阶段 4 | 单元 `tests/unit/pairing/determinism.test.ts`；E2E `pairingPublish.spec.ts` |
| WF-12 | 经理复核警告、不完整队伍与额外参与权益 | 9.3 第 2 步 | 阶段 4 | 单元 `teamFormation.test.ts`（不完整队伍标记）；E2E `pairingPublish.spec.ts` |
| WF-13 | 经理编辑并确认队伍 | 9.3 第 3 步 | 阶段 4 | E2E `pairingPublish.spec.ts`；集成 `auditTrail.test.ts`（人工调整留痕） |
| WF-14 | 系统提议比赛与边/位 | 9.3 第 4 步 | 阶段 5 | 单元 `matchFormation.test.ts`、`sideAssignment.test.ts` |
| WF-15 | 经理编辑房间、确认比赛并发布分配 | 9.3 第 5 步 | 阶段 5 | E2E `pairingPublish.spec.ts`；集成 `constraints.test.ts`（`UNIQUE (event_id, room_name)`、`UNIQUE (match_id, position)`） |
| WF-16 | 学生收到分配通知 | 9.3 第 6 步 | 阶段 5（触发）+ 阶段 9（投递） | E2E `pairingPublish.spec.ts` 断言站内通知；单元 `dedupeKey.test.ts`；集成 `idempotency.test.ts`（发布只入队一次） |
| WF-17 | 持久化提案的输入、分数、警告与算法版本，使管理员能理解"为什么这样建议" | 9.3 末段 | 阶段 4 | 集成测试断言提案持久化记录包含算法版本与分数；E2E `pairingPublish.spec.ts` 断言界面展示原因（13 节要求"不只显示不透明分数"） |

### 10.4 签到与现场运营（9.4）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| WF-18 | 签到在开始前 30 分钟开启 | 9.4 第 1 步 | 阶段 6 | 单元 `tests/unit/domain/deadlines.test.ts`；E2E `studentRegistration.spec.ts` |
| WF-19 | 学生选择 **Check In**；经理可代为人工签到 | 9.4 第 2 步 | 阶段 6 | E2E `studentRegistration.spec.ts`、`exceptionScenarios.spec.ts`；集成 `auditTrail.test.ts`（人工签到审计） |
| WF-20 | 裁判表示就绪/签到 | 9.4 第 3 步 | 阶段 6 | E2E `livePublishBallot.spec.ts`；RLS `judge.rls.test.ts` |
| WF-21 | 到达警告时间时，仪表盘把缺人/缺裁判的房间标为需要关注 | 9.4 第 4 步 | 阶段 6 | E2E `exceptionScenarios.spec.ts`；组件测试覆盖 `warning` 状态（文字+图标，满足 2.8 与 13 节） |
| WF-22 | 经理联系家属或手动解决名册 | 9.4 第 5 步 | 阶段 6 | E2E `exceptionScenarios.spec.ts`；集成 `idempotency.test.ts`（并发移动一致性） |
| WF-23 | 全部必需人员到场时，比赛变为 `ready` | 9.4 第 6 步 | 阶段 6 | 单元 `stateTransitions.test.ts`；E2E `livePublishBallot.spec.ts` |
| WF-24 | 裁判选择 **Start Debate**：该操作**原子地**校验指派/名册、创建名册快照、设置 `started_at` 与 `roster_locked_at`、把状态改为 `started`、并让选票可编辑 | 9.4 第 7 步（事务要求见 5.6） | 阶段 6 | E2E `judgeBallot.spec.ts`；集成 `idempotency.test.ts`：`it('starts a debate once and writes exactly one roster snapshot set for two concurrent Start Debate calls')`；集成断言六件事在同一事务内完成（任一失败则全部回滚） |
| WF-25 | 如果开始时间已过，仪表盘标记该房间为超时 | 9.4 第 8 步 | 阶段 6 | E2E `exceptionScenarios.spec.ts`；单元 `deadlines.test.ts`（超时由时间戳计算） |

### 10.5 选票生命周期（9.5）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| WF-26 | 选票状态机为 `draft → submitted → published`，且存在 `submitted → reopened → resubmitted → published` 的分支 | 9.5 | 阶段 7 | 单元 `tests/unit/domain/stateTransitions.test.ts`；RLS `judge.rls.test.ts`（合法/非法状态下的写权限）；E2E `livePublishBallot.spec.ts` |
| WF-27 | 选票提交即足以把该场辩论标记为结束 | 9.5 第 1 条 | 阶段 7 | 单元 `stateTransitions.test.ts`；E2E `judgeBallot.spec.ts` 断言提交后比赛状态变化 |
| WF-28 | 提交时校验模板、胜负/名次、分数与书面反馈 | 9.5 第 2 条 | 阶段 7 | 单元 `tests/unit/ballots/templateValidation.test.ts`、`scoreCalculation.test.ts`；E2E `judgeBallot.spec.ts`（缺字段被拒） |
| WF-29 | 已提交/已重交的选票对裁判为只读 | 9.5 第 3 条 | 阶段 7 | RLS `judge.rls.test.ts`：`it('denies a judge updating a submitted ballot without a reopen')`；组件测试断言界面为只读 |
| WF-30 | 经理复核可以修正**纯展示性**笔误，但必须走显式审计流程，且不得静默改变裁判的决定 | 9.5 第 4 条（与 4 节 PERM-D19 存在张力，见第 15 节 A-03） | 阶段 7 | 集成 `tests/integration/database/auditTrail.test.ts`（该修正必须留痕）；RLS 断言该路径不能改写 `winner_team_id` 等决定性字段；期望值待第 17 节确认 |
| WF-31 | 重开记录操作者、时间、原因与变更前后值 | 9.5 第 5 条 | 阶段 7 | 集成 `auditTrail.test.ts`：`it('records actor, timestamp and before/after values on reopen')`；RLS 确认只有经理/超管可重开 |
| WF-32 | 发布时**原子地**设置选票与该场比赛的发布时间，并排队通知 | 9.5 第 6 条 | 阶段 7 | 集成 `idempotency.test.ts`：`it('publishes a ballot once and queues exactly one notification set for two concurrent publish calls')`；E2E `livePublishBallot.spec.ts` |

---

## 11. 配对、排赛与边/位逻辑（来源：10）

### 11.1 算法输入（10.1）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-01 | 输入包含每名已报名且可用学生的"合格且已启用格式" | 10.1 | 阶段 4 | 单元 `tests/unit/pairing/teamFormation.test.ts`（fixture 形状见 `docs/testing.md` 第 2.2 节） |
| PAIR-02 | 输入包含有序的格式偏好 | 10.1 | 阶段 4 | 单元 `tests/unit/pairing/formatAllocation.test.ts` |
| PAIR-03 | 输入包含每个格式的 1–10 评分 | 10.1（约束见 6.2） | 阶段 4 | 单元 `teamFormation.test.ts`；集成 `constraints.test.ts`（评分范围与 `eligible ⇒ rating NOT NULL`） |
| PAIR-04 | 输入包含已接受的搭档请求（若有） | 10.1 | 阶段 3（数据）+ 阶段 4（使用） | 单元 `teamFormation.test.ts`：`it('keeps an accepted partner group together even when their ratings differ by 4')` |
| PAIR-05 | 输入包含历史队友与对手次数 | 10.1 | 阶段 4 | 单元 `teamFormation.test.ts`、`matchFormation.test.ts`（重复对手） |
| PAIR-06 | 输入包含近期边/位历史 | 10.1 | 阶段 4 | 单元 `sideAssignment.test.ts` |
| PAIR-07 | 输入包含本事件当前的参与数与权益类型 | 10.1 | 阶段 4 | 单元 `formatAllocation.test.ts`；集成 `constraints.test.ts`（`UNIQUE (event_id, student_id, participation_number)`） |
| PAIR-08 | 事件日重跑时，输入包含签到/可用状态 | 10.1 | 阶段 6 | 单元 `formatAllocation.test.ts`（fixture 的 `checkedIn`）；E2E `exceptionScenarios.spec.ts` |

### 11.2 格式分配（10.2）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-09 | 把学生的常规参与分配到"合格、已启用且能形成可行小组"的最高偏好；做全局优化而不是贪心地满足每个人的第一志愿 | 10.2 第 1 段 | 阶段 4 | 单元 `tests/unit/pairing/formatAllocation.test.ts`：`it('maximizes the number of students receiving one valid debate before honoring first preferences')` |
| PAIR-10 | 主要目标 1：最大化"至少获得一场有效辩论"的学生人数 | 10.2 | 阶段 4 | 单元 `formatAllocation.test.ts` |
| PAIR-11 | 主要目标 2：避免资格违规 | 10.2 | 阶段 4 | 单元 `formatAllocation.test.ts`：`it('never allocates a student to a format they are not eligible for')` |
| PAIR-12 | 主要目标 3：最大化完整队伍与完整比赛的数量 | 10.2 | 阶段 4 + 阶段 5 | 单元 `teamFormation.test.ts`、`matchFormation.test.ts` |
| PAIR-13 | 主要目标 4：尽量满足更高的格式偏好 | 10.2 | 阶段 4 | 单元 `formatAllocation.test.ts` |
| PAIR-14 | 主要目标 5：最小化管理员的警告与人工移动次数 | 10.2 | 阶段 4 | 单元 `formatAllocation.test.ts`、`teamFormation.test.ts`（警告计数） |
| PAIR-15 | 主要目标 6：只有当权益类型被显式选择时才分配额外辩论 | 10.2（与 2.3 一致） | 阶段 4 | 单元 `formatAllocation.test.ts`：`it('allocates an extra participation only when the entitlement type is explicitly selected')`；集成 `constraints.test.ts`（不设 `(event_id, student_id)` 唯一约束） |
| PAIR-16 | 每一个非显而易见的分配都要产生解释权衡的警告 | 10.2 末段 | 阶段 4 | 单元 `formatAllocation.test.ts`：`it('emits a warning explaining the tradeoff for every non-obvious allocation')`；E2E `pairingPublish.spec.ts` 断言界面显示原因与警告（13 节） |

### 11.3 队伍形成（10.3）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-17 | 先锁定"已接受且双方可用、且人数合法"的搭档组 | 10.3 第 1 步 | 阶段 4 | 单元 `tests/unit/pairing/teamFormation.test.ts` |
| PAIR-18 | 其余学生按 `rating_snapshot` 排序，评分相同则按稳定的学生 UUID 打破平局（确定性） | 10.3 第 2 步 | 阶段 4 | 单元 `teamFormation.test.ts`：`it('orders remaining students by rating_snapshot then by ascending student UUID')`；`determinism.test.ts` |
| PAIR-19 | 生成大小为 `team_size` 的候选组 | 10.3 第 3 步 | 阶段 4 | 单元 `teamFormation.test.ts`；`迁移` 断言 `team_size` 来自 `debate_formats` |
| PAIR-20 | 用文档化的 `team_cost` 公式给每个候选组打分：1000×资格违规 + 500×不可用学生 + 100×不完整队伍 + 10×评分极差 + 4×评分标准差 + 2×重复队友惩罚 − 50×已接受搭档奖励；成本越低越好 | 10.3 第 4 步 | 阶段 4 | 单元 `teamFormation.test.ts`：`it('computes team_cost with the documented weights 1000/500/100/10/4/2/-50')` |
| PAIR-21 | 在常规生成中，资格与可用性是**硬约束**；公式中的大权重用于记录优先级，供例外/人工分析使用 | 10.3 第 4 步末段 | 阶段 4 | 单元 `teamFormation.test.ts`：`it('treats an unavailable student as a hard constraint in ordinary generation')` |
| PAIR-22 | 选择总成本最低的、互不重叠的候选队伍集合 | 10.3 第 5 步 | 阶段 4 | 单元 `teamFormation.test.ts`：`it('selects the non-overlapping candidate set with the lowest total team_cost')` |
| PAIR-23 | 标记落单者，并提议"能提升可行性"的跨格式最小移动 | 10.3 第 6 步 | 阶段 4 | 单元 `teamFormation.test.ts`：`it('flags incomplete teams and proposes the smallest cross-format move that improves viability')` |
| PAIR-24 | 目标是评分相近的搭档；重复队友只算轻微惩罚（因为允许稳定搭档）；已接受的搭档请求优先于评分相似度，除非不可能 | 10.3 末段（与 2.5 一致） | 阶段 4 | 单元 `teamFormation.test.ts`（搭档优先与轻惩罚两条用例） |

### 11.4 比赛形成（10.4）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-25 | 按 `teams_per_match` 组队并用文档化的 `match_cost` 公式打分：12×平均评分极差 + 8×重复对手数 + 3×重复裁判暴露估计 + 2×分配后的边不平衡；成本越低越好 | 10.4 | 阶段 5 | 单元 `tests/unit/pairing/matchFormation.test.ts`：`it('computes match_cost with the documented weights 12/8/3/2')` 等 |
| PAIR-26 | 对 BP 要同时比较整体房间强度与相邻队伍强度；**不得**把四队名次简化为二元胜负模型 | 10.4 末句 | 阶段 5（与阶段 7 计分相关） | 单元 `matchFormation.test.ts`：`it('evaluates BP rooms by both overall rating spread and adjacent team strength')`；选票侧见第 15 节 A-08 |

### 11.5 边/位分配（10.5）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-27 | 选择使每名学生**历史不平衡最小**的边/位分配；PF/JWSD/WSDC/1v1 使用 `PROP`/`OPP`，BP 使用 `OG`/`OO`/`CG`/`CO` | 10.5（与 6.4 一致） | 阶段 5 | 单元 `tests/unit/pairing/sideAssignment.test.ts`；集成 `constraints.test.ts`（格式相关的位置校验） |
| PAIR-28 | 分数相同时用"以 event ID 与 team ID 为种子的哈希"确定性打破平局，保证输入不变时重跑结果一致 | 10.5 末句 | 阶段 5 | 单元 `sideAssignment.test.ts`：`it('breaks equal scores with a seeded hash of event ID and team ID')`、`it('returns the same side assignment on reruns with unchanged inputs')` |

### 11.6 Ironman 处理（10.6）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-29 | Ironman 是经理显式确认的例外；同时标记相关队员与比赛 | 10.6 | 阶段 6 | 单元 `tests/unit/pairing/ironman.test.ts`；E2E `exceptionScenarios.spec.ts`；集成 `auditTrail.test.ts`（必须留审计） |
| PAIR-30 | Ironman 学生**不得**意外获得重复的发言者分数；选票模板定义重复发言如何归属 | 10.6 | 阶段 7 | 单元 `ironman.test.ts`：`it('never produces duplicate speaker scores for an ironman student')`；单元 `tests/unit/ballots/scoreCalculation.test.ts` |
| PAIR-31 | 一次 ironman 参与在历史中计为一场辩论，除非刻意创建了第二个独立参与（participation） | 10.6（与 2.3 一致） | 阶段 8 | 单元 `ironman.test.ts`；集成 `constraints.test.ts`（`UNIQUE (event_id, student_id, participation_number)` 允许第二个参与） |

### 11.7 人工编辑与重新生成（10.7）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-32 | 经理在比赛开始前可以随时编辑提案 | 10.7 | 阶段 4 + 阶段 6 | E2E `pairingPublish.spec.ts`、`exceptionScenarios.spec.ts` |
| PAIR-33 | 每一次人工更改都被审计 | 10.7（与 6.7 一致） | 阶段 4 起 | 集成 `tests/integration/database/auditTrail.test.ts`：`it('writes an audit_logs row for a rating change, a role grant, a team move and a manual check-in')` |
| PAIR-34 | 重新生成必须保留已锁定/人工调整的分配，除非经理显式选择解锁 | 10.7 | 阶段 4 + 阶段 5 | 单元 `tests/unit/pairing/regeneration.test.ts`：`it('keeps locked/manual assignments when regenerating unless explicitly unlocked')` |
| PAIR-35 | 开始比赛会永久锁定名册快照 | 10.7（与 9.4 第 7 步一致） | 阶段 6 | 集成 `idempotency.test.ts` 与 `constraints.test.ts`（`match_roster_snapshots` 只追加、不可改写）；E2E `judgeBallot.spec.ts` |
| PAIR-36 | 开始之后的名册修复必须走专门的、被审计的紧急修正流程；绝不随意修改快照 | 10.7 | 阶段 6 | RLS 断言 `match_roster_snapshots` 无 `UPDATE`/`DELETE` 策略；集成 `auditTrail.test.ts`；**该流程本身在主规格中未定义**，见第 15 节 A-07 |

### 11.8 算法测试要求（10.8）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| PAIR-37 | 必须包含 fixture 测试，覆盖：五种格式、奇数分组人数、已接受搭档、评分相同、格式回退、重复对手、边平衡、ironman、重复生成、确定性重跑 | 10.8 | 阶段 4 + 阶段 5 | 单元 `tests/unit/pairing/*.test.ts` 全套，fixture 位于 `tests/fixtures/pairing/`（清单见 `docs/testing.md` 第 10 节） |

---

## 12. 裁判指派逻辑（来源：11）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| JASG-01 | 候选裁判必须已批准、对该事件可用、对该格式合格、在现场指派时已签到，且未被指派到时间重叠的比赛 | 11 第 1 段 | 阶段 5 | 单元 `tests/unit/judges/judgeRanking.test.ts`：`it('excludes judges who are not approved, not available, not qualified for the format, or not checked in')`、`it('excludes a judge already assigned to an overlapping match')`；集成 `constraints.test.ts` |
| JASG-02 | 按 `judge_cost = 10 × 曾评过该场任一学生的总次数 + 6 × 近期次数 + 3 × 本事件工作量` 排名，成本越低越好 | 11 公式 | 阶段 5 | 单元 `judgeRanking.test.ts`：`it('ranks candidates by 10 * total_times_judged + 6 * recent_times_judged + 3 * workload')` |
| JASG-03 | V1 只把"重复执裁"作为冲突规则；**不得**在未获产品负责人确认时自行发明学校/教练冲突规则，但函数要能后续扩展 | 11 第 2 段 | 阶段 5 | 单元 `judgeRanking.test.ts`：`it('exposes a conflict-rule extension point without changing the ranking contract')`；`文档复核` 确认没有引入未批准的冲突规则 |
| JASG-04 | 推荐界面显示资格、重复学生数、工作量与任何警告 | 11 第 3 段 | 阶段 5 | E2E `tests/e2e/pairingPublish.spec.ts`（断言四项信息可见）；组件测试覆盖警告展示 |
| JASG-05 | 管理员确认指派 | 11 第 3 段（与 2.1 一致） | 阶段 5 | E2E `pairingPublish.spec.ts`；集成 `auditTrail.test.ts`（指派变更留痕）；RLS 确认裁判不能自我指派（PERM-D13） |
| JASG-06 | 若裁判取消，用同一套排名生成替补 | 11 末句 | 阶段 5 | 单元 `judgeRanking.test.ts`：`it('returns one replacement from the same ranking when an assigned judge cancels')`；E2E `exceptionScenarios.spec.ts` |

---

## 13. 通知与计划任务（来源：12）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| NOTIF-01 | 邮件/站内事件：**报名已开启** | 12 | 阶段 2（触发）+ 阶段 9（投递） | 集成 `tests/integration/database/idempotency.test.ts`（`email_jobs` 入队）；单元 `tests/unit/notifications/dedupeKey.test.ts`；E2E 断言站内通知 |
| NOTIF-02 | 邮件/站内事件：**报名即将截止** | 12（时间表属 17 节待确认项） | 阶段 9 | 单元 `dedupeKey.test.ts`；集成测试断言计划任务按 `scheduled_for` 入队；`手工` 核对提醒时间配置 |
| NOTIF-03 | 邮件/站内事件：**报名已确认/已取消** | 12 | 阶段 3（触发）+ 阶段 9 | E2E `studentRegistration.spec.ts`；集成 `idempotency.test.ts` |
| NOTIF-04 | 邮件/站内事件：**搭档请求与回应** | 12 | 阶段 3（触发）+ 阶段 9 | E2E `studentRegistration.spec.ts`；集成入队断言 |
| NOTIF-05 | 邮件/站内事件：**队伍/比赛/房间分配已发布或已变更** | 12 | 阶段 5（触发）+ 阶段 9 | E2E `pairingPublish.spec.ts`；集成 `idempotency.test.ts` |
| NOTIF-06 | 邮件/站内事件：**事件/辩论提醒** | 12 | 阶段 9 | 集成入队与 `dedupe_key` 断言；`手工` 核对发送时间 |
| NOTIF-07 | 邮件/站内事件：**裁判可用性获批、比赛已指派** | 12 | 阶段 5（触发）+ 阶段 9 | E2E `judgeBallot.spec.ts`；集成入队断言 |
| NOTIF-08 | 邮件/站内事件：**在适当情况下发出未签到警告** | 12 | 阶段 6（触发）+ 阶段 9 | E2E `exceptionScenarios.spec.ts`；集成入队断言 |
| NOTIF-09 | 邮件/站内事件：**选票逾期**发给裁判，并在管理端标记 | 12 | 阶段 7（标记与触发）+ 阶段 9 | E2E `exceptionScenarios.spec.ts`；集成入队断言 |
| NOTIF-10 | 邮件/站内事件：**选票已发布** | 12 | 阶段 7（触发）+ 阶段 9 | E2E `livePublishBallot.spec.ts`；集成 `idempotency.test.ts`（发布只入队一次） |
| NOTIF-11 | 邮件/站内事件：**选票复核请求已解决** | 12 | 阶段 8（触发）+ 阶段 9 | E2E `studentPublishedBallot.spec.ts`；集成入队断言 |
| NOTIF-12 | 用 `email_jobs.dedupe_key` 防止重复发送 | 12 第 2 段（表定义见 6.7） | 阶段 9 | 单元 `dedupeKey.test.ts`：`it('does not enqueue a second email for the same dedupe_key')`；集成 `idempotency.test.ts` |
| NOTIF-13 | 计划处理必须能容忍重试 | 12 第 2 段 | 阶段 9 | 集成 `idempotency.test.ts`（重复处理同一批任务不产生重复发送）；单元 `dedupeKey.test.ts` |
| NOTIF-14 | 邮件失败**不得**回滚底层业务动作；失败对经理可见且可重试 | 12 第 2 段 | 阶段 9 | 集成 `idempotency.test.ts`：`it('does not roll back a business action when email dispatch fails')`；E2E 或组件测试确认失败在管理端可见 |
| NOTIF-15 | 不需要个人对个人消息功能；通知（notices）面向 global、event、role 或 format 受众 | 12 末段（约束见 6.3） | 阶段 2 | 集成 `constraints.test.ts`（`notices.audience_type` 与目标列的一致性约束）；RLS 确认只有经理/超管可写（PERM-D31..D33）；`文档复核` 确认未引入私信功能 |

---

## 14. Definition of Done（来源：16）

| 需求编号 | 需求描述 | 来源章节 | 交付阶段 | 验证方式 |
|---|---|---|---|---|
| DOD-01 | 已实现该阶段商定的验收标准 | 16 | 每个阶段（阶段 0–10） | 该阶段完成报告逐条对照验收标准；E2E/单元/集成证据 |
| DOD-02 | 迁移可以从**空数据库**应用成功 | 16（细则见 14.3） | 阶段 1 起，每个阶段 | `迁移`：`it('applies every migration in order from a completely empty database')`；阶段 10 的"干净数据库迁移排练" |
| DOD-03 | RLS 与服务端授权覆盖了新增的数据与动作 | 16 | 阶段 1 起，每个阶段 | `RLS` 五个角色文件 + `tests/integration/actions/*`；SEC-01、SEC-11 |
| DOD-04 | 自动化测试包含**正常、错误、被禁止、边界**四类情形 | 16（对应 14.1） | 阶段 1 起，每个阶段 | CI 门禁（`docs/testing.md` 第 8 节）；代码评审检查每个功能是否四类齐全 |
| DOD-05 | lint、类型检查、相关测试与构建通过 | 16（对应 14.1） | 每个阶段 | `静态` + `单元` + `集成` + `构建`；CI 门禁 |
| DOD-06 | 手工验证已记录 | 16（对应 14.5） | 每个阶段 | `手工` 清单（`docs/testing.md` 第 9 节）；证据须脱敏 |
| DOD-07 | 无障碍基本项已验证 | 16（对应 13） | 阶段 1 起，每个阶段 | `手工` 键盘操作与尺寸检查；组件测试断言标签、错误识别、焦点管理；目标 WCAG 2.2 AA |
| DOD-08 | 相关处已包含审计与通知行为 | 16 | 阶段 2 起，每个阶段 | 集成 `tests/integration/database/auditTrail.test.ts` + `idempotency.test.ts`（`email_jobs`）；NOTIF 系列 |
| DOD-09 | 源码、日志、fixture 中没有密钥或个人信息 | 16（对应 AGENTS.md 与 5.3） | 每个阶段 | `文档复核` diff 与 fixture 清单；SEC-20；密钥扫描工具需先获批准 |
| DOD-10 | 相关文档与需求追溯表已更新 | 16（对应 0.3、15） | 每个阶段 | `文档复核`：本文件、`docs/testing.md`、`OWNER_GUIDE.md`、`NEXT_STEP.md` 与实际实现一致 |
| DOD-11 | 提供简洁的完成报告，更新 `OWNER_GUIDE.md` 与 `NEXT_STEP.md`，并**停下等待批准** | 16（细则见 14.6、AGENTS.md） | 每个阶段 | `文档复核` 完成报告是否包含 14.6 要求的全部字段；确认未在未获批准时进入下一阶段 |

---

## 15. 歧义、矛盾与需求缺口（需要产品负责人澄清）

以下问题会影响数据模型、权限、流程或测试的期望值，**在获得明确答复之前不得猜测实现**（主规格第 17 节、`AGENTS.md` 第 5 条）。

| 编号 | 问题 | 相关需求 | 为什么重要 |
|---|---|---|---|
| A-01 | **教练是否可以修改学生评分/资格？** 3.3 说"若获得该运营权限"；权限矩阵第 4 节写 `If permitted`；第 17 节把"教练改评分 vs 只读"列为开放决策。 | COA-02、PERM-06 | 这决定 RLS 策略是"默认拒绝 + 逐项授权"还是"默认可"，也决定 `coach.rls.test.ts` 的期望值。目前无法冻结该测试。 |
| A-02 | **取消后重新报名**：14.4 旅程 3 要求"在允许规则内取消/重新报名"，但 6.3 的 `UNIQUE (event_id, student_id)` 只允许同一行存在。 | STU-02、STU-05、WF-06、WF-08 | 若重新报名是"更新同一行"，则原始报名时间与取消历史会丢失；若允许新行，则唯一约束冲突。需要明确哪种语义，以及历史如何保留。 |
| A-03 | **经理能否直接修改已提交选票？** 9.5 允许"通过显式审计流程修正纯展示性笔误"，而权限矩阵 PERM-11 写经理"不得起草/提交选票"。 | PERM-D19、WF-30 | "展示性笔误"与"裁判决定"的边界、以及该操作走哪个接口，决定了 RLS 是否要开一条特殊写路径。第 17 节也把它列为待确认项。 |
| A-04 | **比赛"完成"的语义**：2.8 说 `complete` = 选票已提交/已发布；9.5 说"提交即足以标记辩论结束"；6.4 的 `match_status` 同时有 `ballot_submitted` 与 `published`。 | WF-27、SC-07 | 决定实时面板把哪种状态算作"缺少选票"、以及 `tests/unit/domain/stateTransitions.test.ts` 的期望值。 |
| A-05 | **`registration_closed` 是存储状态还是派生状态**：9.2 第 6 步要求"即使计划任务未运行也按时间戳自动关闭"，但 6.3 的 `events.status` 是存储列。 | WF-09、WF-01 | 决定状态机测试是测"存储值"还是测"派生值"，也决定是否可能出现"存储为 open 但实际已关闭"的中间态。 |
| A-06 | **报名窗口的边界定义**："流程窗口内"（7 节）与"报名即将截止"的具体偏移量未定义。 | SEC-04、NOTIF-02、WF-08 | 决定截止判定的边界用例（恰好等于截止时间算哪边）与提醒任务的时间表。第 17 节列为待确认项。 |
| A-07 | **"紧急绕过开始比赛"与"开始后名册修复"的流程未定义**：权限矩阵给了经理/超管 `Emergency override`，10.7 要求"专门的、被审计的紧急修正流程"，但都没有具体规则。 | PERM-10、PAIR-36、WF-24 | 没有流程就没有可写的测试；同时它是高风险操作，必须有审计与边界。 |
| A-08 | **BP 的胜负/名次语义**：`ballots.winner_team_id` 是单个字段，而 10.4 明确要求不要把四队名次退化为二元胜负。 | PAIR-26、WF-28 | 决定 BP 的 `match_teams.result`/`placement` 如何填写、`scoreCalculation.test.ts` 与选票模板如何设计。 |
| A-09 | **裁判排名公式的平局规则未写明**：10.3 与 10.5 给了确定性平局规则，第 11 节的 `judge_cost` 没有。 | JASG-02、PAIR-28 | 确定性是项目硬性要求；没有平局规则，"同样输入同样输出"无法保证。本表暂按裁判 UUID 升序处理。 |
| A-10 | **分配可见性的时机**：第 17 节待确认"确认后立即可见，还是需要单独的发布动作"。3.4 同时提到"confirm"与"publish"。 | PERM-04、WF-15、STU-07、J1–J4 | 决定 J4/J7 的 E2E 步骤，以及"未发布时学生看到什么"的断言。 |
| A-11 | **`match_cost` 中的 `repeated_judge_exposure_estimate` 与第 11 节的时间顺序冲突**：排赛发生在裁判指派之前，此时还无法知道实际裁判。 | PAIR-25、JASG-02 | 需要确认这是一个基于历史的近似估计值（而非本场实际指派），否则公式无法计算。 |
| A-12 | **浏览器是否直连 Supabase**：5.1 列出 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（浏览器可见），5.2 又要求"尽可能让浏览器只与应用自己的域名通信"。 | SEC-10、SEC-13、SC-10 | 这决定认证流程放在浏览器还是服务端，也决定中国大陆连通性测试要测哪些域名。 |
| A-13 | **搭档组人数超过 `team_size` 时怎么办**：10.3 第 1 步只说"若人数合法"就锁定。 | PAIR-17、PAIR-24 | 例如 PF（`team_size = 2`）里 3 人互相接受请求，规则未定义，测试无法编写期望值。 |
| A-14 | **审计日志的保留与不可删除之间的冲突**：6.7 与 3.5 要求审计行永不被应用删除，但第 17 节把"个人数据保留/删除政策"列为待确认项。 | SEC-09、ADM-06、DOD-09 | 若将来需要按隐私要求删除个人信息，与"审计不可删除"存在张力，需要明确用"匿名化"还是其他方式解决。 |
| A-15 | **`participations` 与 `registrations` 之间没有外键**（6.4 的 `participations` 只有 `event_id` 与 `student_id`）。 | PAIR-07、PAIR-15 | 额外参与（extra participation）场景下，无法从数据上判断某次参与源自哪条报名，影响历史追溯与统计口径。 |

**说明：** 第 15 节中的 A-14、A-15 属于结构性观察，不影响 V1 是否能运行，但会影响"历史是否可完整追溯"这一产品目标（SC-08），因此建议在阶段 1 建表之前先确认。

---

## 16. 统计与自查

- **本表共映射 255 条需求**：`SC` 11 条、`STU` 14 条、`JDG` 14 条、`COA` 6 条、`MGR` 14 条、`ADM` 6 条、`PERM` 21 条、`PERM-D` 45 条、`SEC` 20 条、`RT` 3 条、`WF` 32 条、`PAIR` 37 条、`JASG` 6 条、`NOTIF` 15 条、`DOD` 11 条。
- **覆盖自查（对应任务要求的信息源）**：
  - 1.1 的每一条成功标准 → `SC-01` … `SC-11`（11/11）；
  - 3.1–3.5 的每一条故事要点与"不能做"约束 → `STU`、`JDG`、`COA`、`MGR`、`ADM`（全部条目，含把复合句拆成独立行）；
  - 第 4 节权限矩阵的每一条能力行 → `PERM-01` … `PERM-21`；矩阵中每一个 "No" 单元格 → `PERM-D01` … `PERM-D45`；
  - 第 7 节的核心策略期望（8 条）与附加保护（7 条）→ `SEC-01` … `SEC-18`，另含 5.3 的密钥与启动校验 → `SEC-19`、`SEC-20`；
  - 第 9 节的事件生命周期、报名、配对发布、签到运营、选票生命周期全部步骤 → `WF-01` … `WF-32`；
  - 第 10 节的输入、格式分配、队伍形成、比赛形成、边/位、ironman、人工编辑与算法测试 → `PAIR-01` … `PAIR-37`；第 11 节的裁判指派 → `JASG-01` … `JASG-06`；
  - 第 12 节的通知清单（11 项）与去重/重试/失败隔离/受众规则（4 项）→ `NOTIF-01` … `NOTIF-15`；
  - 第 16 节 Definition of Done 的 11 条 → `DOD-01` … `DOD-11`。
- **每条需求都至少有一个验证方式**，且多数条目同时具备自动化与人工验证。
- **本文档不声称任何测试已运行或已通过**；所有内容均为计划。
