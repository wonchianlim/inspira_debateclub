# INSPIRA 测试与验证策略（V1 计划）

> **文档状态：计划文档（Phase 0 交付物）。**
> 本文档只描述"将来要做什么测试、怎么做、怎样算通过"。
> 截至本文档编写时，**下方列出的任何测试都尚未编写、尚未执行**；本文档中的任何说法都不构成"测试已运行"或"测试已通过"。
> 某个测试是否通过，只能由该阶段实际执行的命令输出证明。参见 `AGENTS.md` 的 Testing Rules 与主规格第 14.6 节。

**依据：** `INSPIRA_DEEPSEEK_MASTER_SPEC.md`（V1 主规格）第 5.1、5.2、5.4、5.6、7、9、10、11、12、14、15、16 节；`AGENTS.md`。
**相关文档：** 中国大陆连通性测试的**执行记录**保存在 [`docs/deployment-regions.md`](./deployment-regions.md)，本文档只说明"怎么测、记录什么"，不重复该文档的内容。需求到阶段的映射见 [`docs/requirements-traceability.md`](./requirements-traceability.md)。

---

## 0. 阅读说明与术语表

本文档的**说明文字使用简体中文**；代码标识符、文件路径、工具名、测试名、SQL 语句保留英文，方便直接复制到代码和命令里。

第一次出现的专业词在这里解释一次：

| 术语 | 用大白话解释 |
|---|---|
| 单元测试（unit test） | 只测一个很小的函数，不连数据库、不开网页。速度最快，用来证明"算法算得对"。 |
| 集成测试（integration test） | 把几个部分连起来测，通常真的连一个测试用数据库。用来证明"零件装在一起也对"。 |
| 端到端测试（end-to-end / E2E） | 用程序模拟一个真人：打开浏览器、点按钮、填表单，从头走完一个完整业务流程。 |
| RLS（Row Level Security，行级安全） | PostgreSQL 数据库自带的功能：同一条 SQL，不同登录身份只能看到属于自己的行，其他行"像不存在一样"。它是**最后一道**权限防线。 |
| 策略（policy） | RLS 里的规则条目，决定某个身份对某张表的某一行是"允许"还是"拒绝"。 |
| 角色（role） | 本系统有两层含义：①**应用角色** `app_role`，存在 `user_roles` 表里，共五个：`student`、`judge`、`coach`、`club_manager`、`super_admin`；②**数据库角色**，PostgreSQL 自带的 `anon`、`authenticated`、`service_role`。 |
| fixture（测试固件） | 一份写死的、固定的测试数据。因为数据不变，同样的输入每次都应得到同样的输出，这样才能发现"结果不稳定"的 bug。 |
| 确定性（deterministic） | 同样的输入，无论运行多少次、无论谁运行，结果完全一样。 |
| 幂等（idempotent） | 同一个操作被重复执行（例如用户手抖点了两次按钮），结果和只执行一次一样，不会多出记录。 |
| 质量门禁（quality gate） | 一组必须全部通过才能继续的检查。任何一项失败，本阶段就不能宣布完成。 |

**重要约定：** 本文档所有测试名称、目录、fixture 形状都是**提议（planned）**，实现阶段可以按实际情况微调，但测试所覆盖的**规则**不得删减；任何删减必须记入该阶段的完成报告（completion report）并说明理由。

---

## 1. 测试金字塔与工具

主规格第 5.1 节确定的工具链：Vitest（单元/集成）、React Testing Library（组件行为）、Playwright（端到端）、ESLint + Prettier + TypeScript 编译器（静态检查）。

### 1.1 为什么需要这么多层，各层能抓到什么

每一层能发现的问题都不一样，缺一层就会漏掉一类错误：

| 层级 | 工具 | 能抓到别的层抓不到的东西（速度/范围） | 抓不到的东西 |
|---|---|---|---|
| 静态检查 | `tsc`、ESLint、Prettier | **不用运行程序**就能发现：类型不匹配、拼错的字段名、未处理的 `null`、忘记 `await` 的 Promise（异步操作）、不符合团队格式的代码。改动一万行代码时，它能在几秒内指出哪一行可能出错。 | 逻辑错误。比如公式写对了语法但系数写错，它不会报错。 |
| 单元测试 | Vitest | **几毫秒内**反复验证纯逻辑：配对/排赛/指派裁判的评分公式、状态机跳转、截止时间分类、资格校验、分数计算。可以构造极端数据（相同评分、奇数人数、全部重复对手）来验证规则。 | 数据库约束、权限策略、真实网络、页面渲染。 |
| 组件测试 | React Testing Library（RTL） | 验证**一个页面片区**的行为是否符合人的直觉：表单报错信息是否出现、按钮是否可键盘操作、加载/空/错误状态是否显示、是否保留了用户已填内容。它是从"用户能看到什么"的角度测，而不是测内部实现细节。 | 跨页面的完整流程（例如"报名→配对→发布"三步）；真实的权限拒绝。 |
| 集成测试 | Vitest + 真实测试数据库 | 验证**数据库本身**的规则：迁移脚本能否从空库跑通、约束是否真的拦住非法数据、RLS 策略是否真的拒绝越权、审计行是否真的产生、并发重复提交是否真的只写一条。**这一层是权限与数据安全的唯一可信证明**。 | 浏览器里的真实交互（Cookie、跳转、按钮状态）。 |
| 端到端测试 | Playwright | 用真浏览器走完**完整的用户旅程**：注册、开启报名、报名、配对发布、裁判开赛、提交选票、管理员发布、学生查看。它能发现"每一块单独都对，但拼起来不对"的问题，例如登录后跳错页面、通知没发出。 | 内部算法细节；它的运行慢且脆弱，不适合测边界公式。 |
| 人工验收 | 人（产品负责人 + DeepSeek 引导） | 视觉、文案、真实设备的触感、中国大陆网络的真实可达性、无障碍的键盘体验。**机器无法替代**，尤其是跨境的网络测试。 | 大批量重复执行不现实；因此只覆盖关键路径。 |

一句话总结层次关系：**静态检查保证"代码不写错"，单元测试保证"算法想对了"，集成测试保证"数据库守得住"，端到端测试保证"整条路走得通"，人工验收保证"真实世界能用"。** 下层失败时上层不必运行；上层通过也不能替代下层。

### 1.2 各层计划的运行命令（脚本名将在 Phase 1 按仓库实际确定）

主规格第 14.1 节要求每个阶段运行相关子集：

```text
format check   →  pnpm format:check        （Prettier 检查格式，不改文件）
lint           →  pnpm lint                （ESLint）
typecheck      →  pnpm typecheck           （tsc --noEmit，严格模式）
unit tests     →  pnpm test:unit           （Vitest，只跑 tests/unit）
db/integration →  pnpm test:integration    （Vitest，跑 tests/integration，需要本地测试数据库）
build          →  pnpm build               （Next.js 生产构建）
e2e            →  pnpm test:e2e            （Playwright）
```

> 包管理器与脚本名以 Phase 1 初始化后的 `package.json` 为准；若与实际不同，以仓库为准并更新本文档。**在任何阶段都不得声称某条命令通过，除非它确实被运行并留下了输出。**

---

## 2. 单元测试

对应主规格第 14.2 节，以及第 10、11 节的算法规则。单元测试不连数据库、不连网络，全部使用固定 fixture。

### 2.1 核心要求：确定性

主规格第 10.3 节明确要求：剩余学生按 `rating_snapshot`（评分快照）排序，**评分相同则按稳定的学生 UUID 排序**。第 10.5 节要求边/位分配在分数相同时，用**以 event ID 和 team ID 为种子的哈希**打破平局。第 10.8 节要求覆盖"确定性重跑（deterministic reruns）"。

这些要求的含义：**任何时候都不能依赖"数据库随便返回的顺序"**。JavaScript/Python 的排序、`Object.keys()` 的顺序、SQL 不带 `ORDER BY` 的结果，都可能在不同时刻不同。因此：

- 代码中必须写出显式的、完整的排序键（例如先 `rating_snapshot` 降序，再 `studentId` 字符串升序）；
- 测试必须**断言稳定的顺序本身**，而不只是断言"成本相同"；
- 测试必须**运行两次并比较结果完全相等**（深比较），以证明重跑稳定。

具体的断言写法（计划）：

```ts
// tests/unit/pairing/determinism.test.ts
it('produces byte-identical proposals for two runs over the same fixture', () => {
  const first = buildTeamProposal(fixture);
  const second = buildTeamProposal(structuredClone(fixture));
  expect(second).toEqual(first);            // 结果完全一致
  expect(second.teams.map(t => t.teamId)).toEqual(first.teams.map(t => t.teamId)); // 顺序也一致
});

it('orders equal-rated students by ascending student UUID', () => {
  // fixture 中两名学生评分都是 7，UUID 分别为 ...-aaa 和 ...-bbb
  const ordered = orderRemainingStudents(fixture);
  expect(ordered.map(s => s.studentId)).toEqual([UUID_AAA, UUID_BBB]);
});
```

同时要有**反例守卫**：如果实现里误用了不稳定的排序键，测试应当失败。因此在评审时，评审人要问一句："如果我把排序键换成一个不稳定的键，这条测试会不会红？" 如果不会，这条测试就没有价值。

### 2.2 fixture 的形状（计划）

fixture 放在 `tests/fixtures/`，用 TypeScript 类型描述，UUID 全部是虚构的固定值。

```ts
// tests/fixtures/pairing/types.ts（计划形状）
export type FormatCode = 'PF' | 'JWSD' | 'WSDC' | 'BP' | 'ONE_V_ONE';
export type EntitlementType =
  | 'weekly_entitlement' | 'extra_paid' | 'extra_complimentary' | 'extra_payment_pending';

export type StudentFixture = {
  studentId: string;                                  // 固定虚构 UUID
  displayName: string;                                // 虚构姓名，例如 "Student Alpha"（禁止真实学生姓名）
  eligibleFormats: FormatCode[];                      // 合格且事件已启用的格式
  preferences: FormatCode[];                          // 有序偏好，第 1 个最想要
  ratings: Partial<Record<FormatCode, number>>;       // 1–10，整数
  acceptedPartnerId: string | null;                   // 已接受的搭档请求
  priorTeammateIds: string[];                         // 历史队友
  priorOpponentIds: string[];                         // 历史对手
  priorJudgeIds: string[];                            // 历史被谁评过
  sideHistory: Record<string, number>;                // 例如 { PROP: 3, OPP: 1 } 或 { OG: 2, OO: 1, CG: 0, CO: 1 }
  participationCountForEvent: number;                 // 本事件已有参与数
  entitlementType: EntitlementType;
  checkedIn: boolean;                                 // 事件日重跑时使用
};

export type FormatFixture = { code: FormatCode; teamSize: number; teamsPerMatch: number; enabled: boolean };
export type JudgeFixture = {
  judgeId: string; approved: boolean; availableForEvent: boolean;
  qualifiedFormats: FormatCode[]; checkedIn: boolean;
  totalTimesJudgedStudentIds: string[]; recentTimesJudgedStudentIds: string[];
  workloadCountForEvent: number; unavailableOverlap: boolean;
};
```

Fixture 必须提供**五种格式、评分相同、奇数人数、已接受搭档、格式回退、重复对手、ironman**等场景的专用数据文件，分别对应主规格第 10.8 节列出的每一种情形。

### 2.3 配对与分配测试清单（对应第 10 节）

文件：`tests/unit/pairing/formatAllocation.test.ts`
- `it('maximizes the number of students receiving one valid debate before honoring first preferences')` —— 对应 10.2 目标 1 优先于目标 4。
- `it('never allocates a student to a format they are not eligible for')` —— 目标 2 是硬约束。
- `it('allocates an extra participation only when the entitlement type is explicitly selected')` —— 目标 6。
- `it('emits a warning explaining the tradeoff for every non-obvious allocation')` —— 10.2 最后一段。

文件：`tests/unit/pairing/teamFormation.test.ts`
- `it('orders remaining students by rating_snapshot then by ascending student UUID')` —— 10.3 第 2 步。
- `it('locks accepted partner groups of a legal size before generating candidates')` —— 10.3 第 1 步。
- `it('keeps an accepted partner group together even when their ratings differ by 4')` —— 10.3 最后一段：搭档请求优先于相似度。
- `it('selects the non-overlapping candidate set with the lowest total team_cost')` —— 10.3 第 5 步。
- `it('computes team_cost with the documented weights 1000/500/100/10/4/2/-50')` —— 用固定输入手算期望值，防止系数被改错。
- `it('treats an unavailable student as a hard constraint in ordinary generation')` —— 10.3。
- `it('flags incomplete teams and proposes the smallest cross-format move that improves viability')` —— 10.3 第 6 步。
- `it('produces identical teams for two consecutive runs over the same fixture')` —— 10.8 确定性重跑。
- `it('keeps locked/manual assignments when regenerating unless explicitly unlocked')` —— 10.7。

文件：`tests/unit/pairing/matchFormation.test.ts`
- `it('groups teams_per_match teams using the value from debate_formats, never a hardcoded 2')` —— 6.2 与 10.4；BP 必须是 4。
- `it('computes match_cost with the documented weights 12/8/3/2')` —— 10.4。
- `it('prefers matchings that reduce repeat_opponent_count')` —— 10.4 与 2.6。
- `it('evaluates BP rooms by both overall rating spread and adjacent team strength')` —— 10.4 末句。
- `it('balances sides over time rather than per single match only')` —— 10.4 的 `side_imbalance_after_assignment`。

文件：`tests/unit/pairing/sideAssignment.test.ts`
- `it('minimizes each student historical side imbalance across the event')` —— 10.5。
- `it('uses PROP/OPP for PF, JWSD, WSDC and ONE_V_ONE and OG/OO/CG/CO for BP')` —— 6.4 与 10.5。
- `it('breaks equal scores with a seeded hash of event ID and team ID')` —— 10.5。
- `it('returns the same side assignment on reruns with unchanged inputs')` —— 10.5 末句。

文件：`tests/unit/pairing/ironman.test.ts`
- `it('marks both the team member and the match as ironman')` —— 10.6。
- `it('never produces duplicate speaker scores for an ironman student')` —— 10.6 与 7（不泄漏/不重复）。
- `it('counts exactly one debate in history for a single ironman participation')` —— 10.6 末句。
- `it('counts two debates when a distinct second participation was deliberately created')` —— 2.3 与 10.6。

### 2.4 裁判指派测试清单（对应第 11 节）

文件：`tests/unit/judges/judgeRanking.test.ts`
- `it('excludes judges who are not approved, not available, not qualified for the format, or not checked in')` —— 11 第 1 段。
- `it('excludes a judge already assigned to an overlapping match')` —— 11 第 1 段与 6.5。
- `it('ranks candidates by 10 * total_times_judged + 6 * recent_times_judged + 3 * workload')` —— 11 公式，用手算期望值断言。
- `it('breaks equal judge_cost ties deterministically by ascending judge UUID')` —— 与 10.3 相同的确定性原则（主规格在裁判公式处未单独写明平局规则，本项按 10.5 的确定性精神执行，并已记入本文档第 12 节的待确认项）。
- `it('returns one replacement from the same ranking when an assigned judge cancels')` —— 11 末句。
- `it('exposes a conflict-rule extension point without changing the ranking contract')` —— 11：不得自行发明学校/教练冲突规则，但函数要能扩展。

### 2.5 其余单元测试（对应第 14.2 节）

- `tests/unit/domain/stateTransitions.test.ts` —— 事件状态机（`draft → registration_open → … → archived`，以及 `cancelled`）与选票状态机（`draft → submitted → published`，以及 `reopened → resubmitted → published`）。必须包含 `it('rejects an invalid transition and leaves no partial mutation')`（第 9.1 节：非法跳转返回领域错误且不产生部分写入）。
- `tests/unit/domain/deadlines.test.ts` —— 截止前取消是 `cancelled`、截止后是 `late_cancelled`（9.2 第 5 步）；签到窗口 = 开始前 30 分钟（9.4 第 1 步）；警告时间与超时判断**只依据时间戳**，不依据浏览器本地时间（5.5）。
- `tests/unit/domain/eligibility.test.ts` —— 未启用格式、未获资格格式的偏好必须被拒绝（6.3 末句、2.7）。
- `tests/unit/ballots/templateValidation.test.ts` —— 提交时校验模板、胜负/名次、分数、书面反馈（9.5）；必填字段缺失必须拒绝（3.2）。
- `tests/unit/ballots/scoreCalculation.test.ts` —— 各格式的总分计算（6.6 示例：WSDC `content/style/strategy/total`、PF `speaker_points`、BP `speaker_score`）。**具体字段与分数范围属于待产品负责人确认项**（第 17 节），本测试的期望值将在确认后冻结。
- `tests/unit/permissions/capabilityHelpers.test.ts` —— 纯函数形式的权限判断（`has_role`、`is_manager` 的 TypeScript 对应层）对五个角色、每一项能力给出允许/拒绝的期望值；它是第 4 节矩阵在代码中的镜像，**不能替代**第 3 节的数据库 RLS 测试。
- `tests/unit/notifications/dedupeKey.test.ts` —— 同一收件人 + 同一 `email_type` + 同一业务实体生成的 `dedupe_key` 稳定且唯一（12 节与 6.7）。

---

## 3. 数据库与 RLS 授权测试

对应主规格第 7 节、第 14.3 节，以及 `AGENTS.md` 的 Database and Security Rules。

### 3.0 本地数据库环境（P1-4 实测记录，已完成）

**结论：完整的 Supabase 本地环境已在 2026-09-29 成功启动并通过验证。**

#### 已确认可用

| 项目 | 状态 |
|---|---|
| Docker 守护进程 | ✅ OrbStack 29.4.0（由产品负责人启动应用后可用） |
| Supabase 本地栈 | ✅ 12 个容器全部健康（`supabase start` 退出码 0） |
| PostgreSQL | ✅ 17.6（与 `config.toml` 的 `major_version = 17` 一致） |
| `auth` schema | ✅ 存在（`auth.users`、`auth.identities` 等），RLS 所依赖的 `auth.uid()` 函数存在 |
| RLS 所需角色 | ✅ `anon`、`authenticated`、`service_role`、`supabase_auth_admin` 均已存在 |
| `supabase db reset` | ✅ 退出码 0，可重建 |

本地地址：API `http://127.0.0.1:54321`、数据库 `127.0.0.1:54322`、Studio `http://127.0.0.1:54323`、Mailpit（假邮件箱）`http://127.0.0.1:54324`。

#### 两个必须知道的操作事实

**1. Supabase CLI 需要 `HOME` 变通（仅本机沙箱需要）。**
CLI 默认写 `~/.supabase`，该目录在工作区之外，被 DSH 文件沙箱拒绝（`FileSystem.makeDirectory`）。已实测可行方式：

```bash
HOME="$PWD/.sb-home" npx supabase <命令>
```

`.sb-home/` 已加入 `.gitignore`。这只是本机沙箱的限制；普通终端与 CI 里 `HOME` 正常，因此 `package.json` 的 `db:*` 脚本保持普通写法。

**2. Docker Hub 不可达，但 Supabase 镜像可用。**
实测：`registry-1.docker.io` 与 `auth.docker.io` **连接超时**，直接 `docker pull postgres:17-alpine` 报 502 Bad Gateway。而 **`public.ecr.aws`（Supabase 官方镜像所在）可达且速度良好**——约 4.9 GB 镜像在数分钟内拉完。

这解释了为什么 `supabase start` 能成功：它使用的是 `public.ecr.aws/supabase/*`，不经过 Docker Hub。
如果将来需要拉取 Docker Hub 上的镜像（例如自建 PostgreSQL、或 CI 中的其他镜像），需要另行配置镜像源；已实测 `docker.m.daocloud.io` 可用（通过它拉取后再 `docker tag` 重命名即可）。

#### ⚠️ 本地环境的安全注意（CLI 自己的提示）

`supabase start` 会明确警告：

- 所有服务绑定在 `0.0.0.0`，**同一局域网内的其他设备也能访问**，不只是本机；
- API key 与 JWT secret 都是**公开的共用默认值**，绝不可用于生产；
- **Studio、pgMeta 与 analytics 没有身份验证**——任何能访问该端口的人都能读写数据库。

因此：本地库里**只放虚构数据**；不要在公共 Wi-Fi 下运行本地栈；用完可 `npm run db:stop` 停止。

#### 已落地的自动化入口（P1-5）

`npm run db:rls-smoke` 会执行 `scripts/rls-smoke.sql`：自建虚构账号与活动、以
`authenticated` 身份逐条执行授权用例、判定后清理数据，**任何用例失败都会让脚本以非零退出码结束**。

当前 **27 条用例**（含允许与拒绝两个方向）。关键设计点：RLS 对 SELECT/UPDATE/DELETE 的
拒绝方式是**静默过滤（0 行）而不是报错**，因此判定必须看**受影响行数**；只有 INSERT 才抛错。
把"没有报错"当成"允许"是本项目踩过的真实陷阱。

> P1-6 会把本脚本扩展为完整套件（覆盖 `docs/permissions.md` 第 6 节全部拒绝用例编号）。

#### 迁移文件命名（实测得出的硬性要求）

CLI 只识别 `<时间戳>_<名称>.sql`。不符合的文件会被**静默跳过**（只打一行警告）。完整说明与已修正的迁移清单见 [`docs/schema.md`](./schema.md) 第 5 节。

### 3.1 最重要的一条原则：必须尝试"被禁止"的操作

主规格第 7 节原文要求：**"Security tests must attempt forbidden reads and writes, not merely confirm allowed operations."**（安全测试必须尝试被禁止的读和写，而不只是确认允许的操作。）

原因用大白话说：如果只测"学生能看到自己的数据"，那么一个"所有人都能看到所有数据"的错误策略也能通过测试。只有加上"学生**看不到**别人的数据"，才能证明策略真的存在。

因此每一项能力都必须成对出现：

1. **正面对照（positive control）**：允许的身份执行该操作，**预期成功**。这一条同时证明"测试环境本身是通的"——否则连接失败、表不存在都会让"拒绝"测试假通过。
2. **拒绝断言（negative assertion）**：被禁止的身份执行同一操作，**预期被拒绝**。

**每条拒绝测试必须与正面对照写在同一个测试文件里。** 只有拒绝断言、没有正面对照的测试视为无效测试。

### 3.2 如何"以某个具体登录用户、某个角色"执行查询

RLS 判断依据是 PostgreSQL 会话里的 JWT 声明（`request.jwt.claims`），其中 `sub` 就是登录用户的 `profiles.id`。所以测试助手需要：

1. 用 `service_role` 连接做数据准备与清理（`setup`/`teardown`）；
2. 用 `authenticated` 数据库角色 + 伪造的 JWT 声明来模拟某个具体应用用户；
3. 用 `anon` 模拟未登录访客；
4. **绝不在业务断言里使用 `service_role`**——它会绕过 RLS，那样测出来的"通过"毫无意义。

计划中的助手 API（`tests/helpers/db.ts`）：

```ts
export async function asUser<T>(profileId: string, fn: (tx: TestTx) => Promise<T>): Promise<T>;
export async function asAnonymous<T>(fn: (tx: TestTx) => Promise<T>): Promise<T>;
export async function asServiceRole<T>(fn: (tx: TestTx) => Promise<T>): Promise<T>; // 仅用于准备/清理
```

它内部执行的 SQL 形状（PostgreSQL）：

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
-- 之后所有查询都以该用户身份、受 RLS 约束地执行
SELECT id, first_name FROM profiles WHERE id = '00000000-0000-4000-8000-0000000000bb';
ROLLBACK;
```

只按**角色**（而不是具体用户）测试时，助手会先插入一个拥有该 `app_role` 的虚构用户（例如 `asRole('coach', fn)`），再用 `asUser` 以它的身份执行——因为五个应用角色是通过 `user_roles` 表表达的，而不是数据库角色。

### 3.3 如何断言"被拒绝"

RLS 的拒绝在不同操作上表现出不同形态，测试必须分别断言：

| 操作 | RLS 拒绝时的表现 | 断言写法（计划） |
|---|---|---|
| `SELECT` | 通常**不报错**，只是返回 0 行（行被过滤掉） | `expect(rows).toHaveLength(0)`，并随后用 `asServiceRole` 确认该行**确实存在** |
| `UPDATE` / `DELETE` | 影响 0 行（也可能因 `WITH CHECK` 失败而报错） | `expect(result.rowCount).toBe(0)`，再用 `asServiceRole` 重新读取，确认**数据未被修改** |
| `INSERT` | 违反 `WITH CHECK` 时抛出错误，SQLSTATE `42501`（insufficient_privilege） | `await expect(promise).rejects.toMatchObject({ code: '42501' })` |
| 表级无策略 | 同样表现为 0 行或 `42501` | 与上表相同 |

关键点：**必须用 `service_role` 回读来证明"数据真的没变"**，而不能只看"没报错"。因为"没报错"也可能意味着"语句根本没执行"。

### 3.4 五个角色的授权测试矩阵（计划文件与用例）

每个文件都同时包含允许用例与拒绝用例。

**`tests/integration/rls/student.rls.test.ts`**
- 允许：`it('lets a student read and update their own profiles row')`（7 节）
- 允许：`it('lets a student read their own registration, participation and published ballot')`
- 拒绝：`it('denies a student reading another student profiles row')`
- 拒绝：`it('denies a student reading a draft or submitted but unpublished ballot')`（3.1、7 节）
- 拒绝：`it('denies a student reading coach_notes')`（3.3、7 节）
- 拒绝：`it('denies a student reading audit_logs')`（3.1）
- 拒绝：`it('denies a student changing profiles.status or inserting into user_roles')`（7 节）
- 拒绝：`it('denies a student inserting a registration after registration_closes_at')`（9.2）
- 拒绝：`it('denies a student registering twice for the same event')`（6.3 唯一约束 + 2.7）

**`tests/integration/rls/judge.rls.test.ts`**
- 允许：`it('lets a judge read matches and rosters assigned to them')`
- 允许：`it('lets a judge insert and update their own ballot while status is draft')`
- 允许：`it('lets a judge update their own paradigm on their judge_profile')`
- 拒绝：`it('denies a judge reading an unassigned match or its roster')`（3.2、7 节）
- 拒绝：`it('denies a judge reading another judge ballot for the same match')`
- 拒绝：`it('denies a judge creating a judge_assignment row for themselves')`（3.2）
- 拒绝：`it('denies a judge updating a submitted ballot without a reopen')`（3.2、9.5）
- 拒绝：`it('denies a judge setting ballots.status to published')`（3.2、4 节）
- 拒绝：`it('denies a judge reading unrelated student profiles, coach_notes or audit_logs')`

**`tests/integration/rls/coach.rls.test.ts`**
- 允许：`it('lets a coach read student operational data, participation history and published ballots')`（3.3、7 节）
- 允许：`it('lets a coach insert and update their own coach_notes rows')`
- 拒绝：`it('denies a coach reading draft or unpublished ballots')`
- 拒绝：`it('denies a coach inserting into user_roles for any role')`（3.4、7 节）
- 拒绝：`it('denies a coach updating ballots.status to published')`（14.3）
- 拒绝：`it('denies a coach reading audit_logs')`
- 拒绝：`it('denies a coach updating student_format_profiles.rating when not granted the operational permission')` —— **该用例的期望值取决于第 17 节的待确认项**（教练是否有权改评分）。

**`tests/integration/rls/clubManager.rls.test.ts`**
- 允许：`it('lets a club manager create, update and clone events and event_formats')`
- 允许：`it('lets a club manager confirm teams, matches and judge assignments')`
- 允许：`it('lets a club manager reopen and publish a ballot')`
- 允许：`it('lets a club manager read audit_logs')`
- 拒绝：`it('denies a club manager inserting a super_admin row into user_roles')`（3.4、14.3）
- 拒绝：`it('denies a club manager updating or deleting any audit_logs row')`（3.4、7 节、14.3）
- 拒绝：`it('denies a club manager drafting or submitting a ballot as a judge')`（4 节）
- 拒绝：`it('denies a club manager changing system-wide security settings')`（3.4）

**`tests/integration/rls/superAdmin.rls.test.ts`**
- 允许：`it('lets a super admin grant and revoke roles, including club_manager')`
- 允许：`it('lets a super admin approve judges and maintain judge_format_qualifications and debate_formats')`
- 允许：`it('lets a super admin read all operational and audit data')`
- 拒绝：`it('denies even a super admin updating or deleting an audit_logs row through the application API')`（3.5、7 节、6.7）

**`tests/integration/rls/anonymous.rls.test.ts`**
- 拒绝：`it('denies an anonymous visitor every table that is not explicitly public')` —— 默认拒绝的证明（7 节第 1 句）。

**`tests/integration/rls/serviceRoleBoundary.test.ts`**
- `it('confirms no client-reachable module imports the service-role client')` —— 静态导入检查（7 节、`AGENTS.md` Architecture Rules）。
- `it('confirms service-role usage happens only in server-only modules')` —— 配合 `server-only` 标记。

### 3.5 数据库结构与约束测试（对应第 14.3 节前半段）

文件：`tests/integration/database/migrations.test.ts`
- `it('applies every migration in order from a completely empty database')` —— 对应 DoD-02。
- `it('can be re-run from scratch and produce the same schema')` —— 迁移可重复。
- `it('seeds exactly the five debate formats with the documented team sizes')` —— PF 2/2、JWSD 3/2、WSDC 3/2、BP 2/4、ONE_V_ONE 1/2（6.2）。

文件：`tests/integration/database/constraints.test.ts`
- `it('rejects a rating outside 1–10')`
- `it('rejects an eligible student_format_profiles row without a rating')` —— 6.2 的 `CHECK`。
- `it('rejects a duplicate registration for the same event and student')` —— 6.3 唯一约束。
- `it('rejects duplicate roles, duplicate judge assignments and duplicate speaker positions')`
- `it('rejects overlapping judge assignments for the same match time')` —— 6.5 末段。
- `it('rejects a match_team position that is not valid for the format')` —— 6.4 的 `PROP/OPP` vs `OG/OO/CG/CO`。
- `it('allows more than one participation per student per event')` —— 2.3 明确禁止 `(event_id, student_id)` 唯一约束。

文件：`tests/integration/database/auditTrail.test.ts`
- `it('writes an audit_logs row for a rating change, a role grant, a team move and a manual check-in')` —— 6.7 与 14.3。
- `it('writes an audit_logs row for ballot reopen, resubmit and publish and for review resolution')` —— 9.5 与 6.7。
- `it('records actor, timestamp and before/after values on reopen')` —— 9.5。

---

## 4. 端到端测试（Playwright）

对应主规格第 14.4 节的九条验收旅程与 `AGENTS.md` 的 "Major workflows require Playwright coverage"。

每条旅程对应一个 spec 文件。所有 E2E 用例都必须使用虚构测试账号，并且**页面加载不得依赖任何未通过中国大陆测试的第三方资源**（5.4）。

| # | 主规格 14.4 的旅程 | 计划 spec 文件 | 该 spec 必须断言的关键点 |
|---|---|---|---|
| J1 | Super Admin 配置角色与格式资格 | `tests/e2e/superAdminProvisioning.spec.ts` | 能授予/撤销 `coach`、`club_manager`；能批准裁判并设置格式资格；审计页出现对应记录；普通经理看不到授权入口 |
| J2 | 经理创建事件、启用格式、开启报名 | `tests/e2e/eventSetup.spec.ts` | 事件从 `draft` 进入 `registration_open`；启用的格式出现在学生端；非法状态跳转被拒绝并给出安全错误信息 |
| J3 | 学生报名、选偏好、请求搭档、按规则取消/重新报名、签到 | `tests/e2e/studentRegistration.spec.ts` | 只能报名一次；偏好只能从未启用的格式之外选择；搭档请求可发出并可回应；截止前取消为 `cancelled`、截止后为 `late_cancelled`；签到窗口内可签到 |
| J4 | 经理生成并编辑队伍/比赛、指派裁判、发布分配 | `tests/e2e/pairingPublish.spec.ts` | 提案显示原因与警告；经理可调整后确认；发布后学生端出现队伍、对手、边/位、房间、裁判与裁判范式 |
| J5 | 裁判报名、被批准、查看分配、开赛、存草稿、提交合法选票 | `tests/e2e/judgeBallot.spec.ts` | 未批准时看不到分配；开赛后名册被锁定；缺必填字段时提交被拒绝并显示行内错误；完整填写后提交成功 |
| J6 | 经理查看实时状态、重开/解决选票更正、发布 | `tests/e2e/livePublishBallot.spec.ts` | 实时面板显示已报名/已签到/缺失/裁判就绪/已开赛/待交选票计数；重开→裁判重交→发布全链路；发布动作被审计 |
| J7 | 学生只看到已发布选票并提交一次复核请求 | `tests/e2e/studentPublishedBallot.spec.ts` | 发布前学生访问选票地址得到安全 403/空态（不泄漏存在性）；发布后可见完整选票与裁判身份；同一选票只能提交一次复核请求 |
| J8 | 教练查看历史/选票并创建学生看不到的私人笔记 | `tests/e2e/coachNotes.spec.ts` | 教练能建笔记；用学生账号访问教练笔记相关页面被拒绝；用裁判账号访问同样被拒绝 |
| J9 | 缺签到、迟到取消、ironman、裁判替换、超时开赛、超时选票 | `tests/e2e/exceptionScenarios.spec.ts` | 每种异常在管理面板上有明确标记；ironman 需经理显式确认且写入审计；裁判取消后能生成替补；超时开赛与超时选票各自触发告警与邮件（邮件用测试邮箱接收确认） |

补充要求：
- E2E 用例之间必须相互独立；数据通过 API/数据库助手准备，不使用"上一条用例留下的数据"。
- E2E 运行结束时收集浏览器 `console` 与网络失败信息，作为完成报告的证据（14.1、5.4 第 9 项）。
- 关键页面要断言无障碍基本项：表单字段有可访问名称、错误信息可被读到、键盘可以完成主要操作（13 节、14.5）。

---

## 5. 并发与幂等测试

对应主规格第 5.6 节：**双击"报名、签到、开赛、提交、发布"不得产生重复记录。** 对应 `AGENTS.md` 的 "Test ... concurrency/idempotency risks"。

文件：`tests/integration/database/idempotency.test.ts`

计划用例（每条都并发触发两次相同请求，然后断言最终状态）：

- `it('creates exactly one registration row for two concurrent identical register calls')`
- `it('leaves registration status checked_in with one checked_in_at for two concurrent check-in calls')`
- `it('starts a debate once and writes exactly one roster snapshot set for two concurrent Start Debate calls')`
- `it('sets started_at and roster_locked_at once for two concurrent start calls')`
- `it('creates exactly one ballot submission for two concurrent submit calls')`
- `it('publishes a ballot once and queues exactly one notification set for two concurrent publish calls')`
- `it('keeps roster and team data consistent when two managers move the same participation at the same time')`（多行事务，5.6 第 1 句）
- `it('enqueues exactly one email_jobs row for a repeated business event with the same dedupe_key')`（12 节、6.7）
- `it('does not roll back a business action when email dispatch fails')`（12 节末段）

实现要点（计划）：
- 用 `Promise.all([action(), action()])` 同时发起两次调用；断言最终记录数、时间戳字段只被写一次、审计行数符合预期。
- 幂等性的最终防线是**数据库约束**（6.3 的 `UNIQUE (event_id, student_id)`、6.5 的 `UNIQUE (match_id, judge_id)`、6.7 的 `UNIQUE dedupe_key`），因此这些测试同时验证约束是否存在。
- 多行操作必须走事务或 PostgreSQL 函数（5.6 第 1 句）；测试应通过"中途注入失败"来验证失败时**整体回滚、不留半成品**。

---

## 6. 中国大陆连通性测试

对应主规格第 5.4 节与第 15 节 Phase 0 / Phase 10。

**测试结果的唯一存放位置是 [`docs/deployment-regions.md`](./deployment-regions.md)。** 本文档只规定"怎么测、要记录哪些字段"，不重复、也不复述该文档的结论。

### 6.1 Phase 0 的连通性验证（proof of access，Phase 1 之前必须完成）

在一个最小的、可丢弃的证明页面上，按 5.4 的九项逐一验证，并记录**日期、城市/省份、运营商、设备、结果、脱敏证据**：

1. DNS 解析与 HTTPS 证书；
2. 首页在无 VPN 情况下可加载；
3. JavaScript、CSS、图标、字体全部加载成功，**没有任何被拦截的第三方请求**；
4. 注册、登录、登出、重置密码、会话刷新；
5. 一次需要登录的 API 读 + 一次写；
6. 邮件投递到至少两个常用中国邮箱服务商；
7. 有代表性的桌面设备与移动设备；
8. 至少两个中国大陆网络，最好包含一条固网 ISP 与一条移动网络；
9. 延迟、失败率、浏览器控制台/网络错误，并在**一天中的第二个时段重复一次**。

**一次成功的页面加载不足以作为依据；任何关键流程失败都会阻断托管决策。**（5.4）

### 6.2 发布前连通性验证（Phase 10）

按第 15 节 Phase 10：在**至少两个实际网络**、**无 VPN** 条件下跑完整矩阵（第一方域名、认证、API、静态资源、邮件），结果写入 `docs/deployment-regions.md`。

### 6.3 执行方式与限制（重要）

- **这类测试无法由 CI 自动完成**，因为 CI 运行器不在中国大陆网络中。它必须由产品负责人（或中国大陆的真实测试用户）在真实设备上手工执行，DeepSeek 负责逐步引导、解释每一项要做什么、以及如何脱敏后回传证据。
- 本项测试属于**人工验收**，不是自动化测试。它同样受"不得声称通过"的约束。
- 边界条件：任何影响浏览器加载、DNS、TLS、认证、CDN、字体或邮件的改动之后，都必须重跑该矩阵（14.5 末句）。

---

## 7. 测试数据与隐私

对应 `AGENTS.md` 的 "Never include secrets, real student data, phone numbers, or personal email addresses in fixtures, logs, screenshots, or commits"，以及主规格第 5.3、5.4 节。

计划规则：

1. **只用虚构身份。** 姓名使用明显虚构的代号，例如 `Student Alpha`、`测试学生甲`、`Judge Bravo`。**禁止使用真实学生姓名。**
2. **邮箱只能使用保留域名。** 使用 `@example.com`（Internet 保留域名，永远不会真实投递）。禁止使用任何真实个人邮箱地址，尤其是真实学生或家长邮箱。
3. **手机号只用不可用的虚构号码**，且必须明显不是真实号段；或直接留空。**禁止真实手机号。**
4. **禁止任何密钥进入测试。** fixture、快照、日志、截图、提交记录中不得出现 `.env` 内容、API key、数据库密码、service-role key。截图必须抹掉邮箱、电话、Token 等敏感区域。
5. **生产日志不记录敏感内容**：手机号、邮件正文、认证 token、选票内容都不得写入生产日志（7 节）。
6. **测试数据库是隔离的**：使用本地或一次性的测试数据库，绝不指向生产数据库（14.3）。清理逻辑放在 `teardown`，保证不残留数据。
7. **不把真实学生数据导入测试环境。** 若将来需要真实数据做验收，必须先获得产品负责人的明确批准，并完成第 5.4 节的隐私/法律复核（主规格第 17 节待确认项）。
8. **密钥扫描**：计划在 CI 中加入"提交内容中是否含密钥"的自动检查。**引入任何新的扫描工具都需要先按第 5.1 节的依赖规则获得产品负责人批准**（不得擅自新增运行时依赖）。在工具确定之前，用人工 diff 复核作为临时措施。

---

## 8. CI 质量门禁

对应主规格第 14.1 节（"CI must run deterministic checks on every pull request"）与第 16 节 Definition of Done。

### 8.1 每次代码变更（每个 Pull Request）必须通过

| 顺序 | 检查 | 命令（计划） | 失败意味着 |
|---:|---|---|---|
| 1 | 格式检查 | `pnpm format:check` | 代码风格不一致，先修格式再谈逻辑 |
| 2 | 静态检查 | `pnpm lint` | 存在可疑写法（未使用变量、可能的 bug 模式） |
| 3 | 类型检查 | `pnpm typecheck` | 类型不匹配，可能在运行时崩溃 |
| 4 | 单元测试 | `pnpm test:unit` | 纯逻辑算错了 |
| 5 | 数据库/集成/RLS 测试 | `pnpm test:integration` | 迁移、约束、权限或审计出问题 |
| 6 | 生产构建 | `pnpm build` | 代码无法打包成可部署版本 |

### 8.2 主分支 / 每日 / 发布前追加

- 端到端测试 `pnpm test:e2e`（Playwright 较慢，放在主分支或每日运行；Phase 10 必须在发布前全量运行）。
- 从**空数据库**重跑全部迁移 + 种子数据（14.3）。
- 中国大陆连通性矩阵（**人工**，见第 6 节）。

### 8.3 阶段完成门禁（对应第 16 节）

只有下列全部满足，一个阶段才允许宣布完成，并向产品负责人提交完成报告：

1. 该阶段商定的验收标准已实现；
2. 迁移能从空数据库应用成功；
3. 新增的数据与动作都有 RLS 与服务器端授权覆盖；
4. 自动化测试包含**正常、错误、被禁止、边界**四类情形；
5. 格式检查、lint、类型检查、相关测试、构建全部通过；
6. 人工验收已执行并记录；
7. 无障碍基本项已验证；
8. 相关处已包含审计与通知行为；
9. 源码、日志、fixture 中没有密钥与个人信息；
10. 相关文档与需求追溯表已更新；
11. 已提交完成报告、更新 `OWNER_GUIDE.md` 与 `NEXT_STEP.md`，并**停下等待批准**。

**任何一项未通过都不得宣布阶段完成。** 如果某项因环境原因无法运行，必须在完成报告中如实说明"未运行"及原因，不得写成"通过"（14.6、`AGENTS.md`）。

---

## 9. 手工验收流程（manual verification）

对应主规格第 14.5 节。

每个阶段都要提供一份简短的手工核对清单，包含以下字段：

| 字段 | 内容要求 |
|---|---|
| 步骤 | 一句大白话说明做什么 |
| 网址 | 具体的页面地址 |
| 测试账号/角色 | 使用哪个虚构账号、拥有哪个应用角色 |
| 预期结果 | 屏幕上应该看到什么（含状态文字，不仅靠颜色） |
| 实际结果 | 执行后如实填写 |
| 证据 | 脱敏截图、命令输出、浏览器 Network 面板记录 |
| 复现步骤 | 如果失败，给出能重复触发的最小步骤 |

固定检查项：

1. **代表性屏幕尺寸**：至少 375×667（手机）、768×1024（平板）、1440×900（桌面）各看一遍，确认没有内容被遮挡或溢出。
2. **纯键盘操作**：仅用 Tab / Shift+Tab / Enter / Space / 方向键走完新流程的主要操作，确认焦点可见、焦点顺序合理、没有必须用鼠标才能完成的步骤（13 节）。
3. **状态与颜色无关**：确认所有状态同时有文字或图标，不只靠颜色区分（2.8、13 节）。
4. **加载/空/错误/未授权/成功五种状态**：每个主要页面都要看过（13 节末）。
5. **中国大陆冒烟测试**：从 Phase 0 起保持可重复执行——公开页面、登录、一次需要登录的读/写、静态资源、邮件（14.5）。
6. **不泄漏存在性**：未授权访问受保护记录时，只能看到安全的 403 或跳转，不能从错误信息推断记录是否存在（8 节）。

**证据必须脱敏**：截图中要遮住邮箱、手机号、Token、`.env` 内容。**绝不把密钥贴进聊天或提交到仓库**（`AGENTS.md` Beginner Guidance Rules）。

---

## 10. 测试目录结构（计划）

与主规格第 5.2 节的源码布局保持一致：主规格给出 `tests/unit`、`tests/integration`、`tests/e2e` 三个目录；本文档在此基础上增加 `tests/fixtures`（固定测试数据）与 `tests/helpers`（测试助手）两个子目录，属于§5.2 允许的合理适配。

```text
tests/
  unit/                                   # Vitest，纯逻辑，不连数据库
    domain/
      stateTransitions.test.ts            # 第 9 节状态机
      deadlines.test.ts                   # 5.5 / 9.2 / 9.4 时间与截止
      eligibility.test.ts                 # 2.4 / 6.2 / 6.3 资格与偏好
    pairing/
      formatAllocation.test.ts            # 10.2
      teamFormation.test.ts               # 10.3
      matchFormation.test.ts              # 10.4
      sideAssignment.test.ts              # 10.5
      ironman.test.ts                     # 10.6
      regeneration.test.ts                # 10.7
      determinism.test.ts                 # 10.8
    judges/
      judgeRanking.test.ts                # 第 11 节
    ballots/
      templateValidation.test.ts          # 9.5 / 6.6
      scoreCalculation.test.ts            # 6.6
    permissions/
      capabilityHelpers.test.ts           # 第 4 节矩阵的纯函数镜像
    notifications/
      dedupeKey.test.ts                   # 第 12 节 / 6.7
  integration/                            # Vitest + 真实测试数据库
    database/
      migrations.test.ts                  # 14.3 / DoD-02
      constraints.test.ts                 # 6 节约束
      auditTrail.test.ts                  # 6.7 / 9.5
      idempotency.test.ts                 # 5.6 并发与幂等
    rls/
      anonymous.rls.test.ts
      student.rls.test.ts
      judge.rls.test.ts
      coach.rls.test.ts
      clubManager.rls.test.ts
      superAdmin.rls.test.ts
      serviceRoleBoundary.test.ts
    actions/                              # Server Action / Route Handler 行为
      registration.test.ts
      checkIn.test.ts
      startDebate.test.ts
      ballotSubmit.test.ts
      ballotPublish.test.ts
  e2e/                                    # Playwright，对应 14.4 九条旅程
    superAdminProvisioning.spec.ts        # J1
    eventSetup.spec.ts                    # J2
    studentRegistration.spec.ts           # J3
    pairingPublish.spec.ts                # J4
    judgeBallot.spec.ts                   # J5
    livePublishBallot.spec.ts             # J6
    studentPublishedBallot.spec.ts        # J7
    coachNotes.spec.ts                    # J8
    exceptionScenarios.spec.ts            # J9
    fixtures/                             # E2E 专用登录状态与页面对象
  fixtures/                               # 固定测试数据（虚构身份）
    pairing/
      types.ts
      fiveFormats.fixture.ts
      oddGroupSizes.fixture.ts
      acceptedPartners.fixture.ts
      equalRatings.fixture.ts
      repeatOpponents.fixture.ts
      sideBalancing.fixture.ts
      ironman.fixture.ts
      formatFallback.fixture.ts
    judges/
      judgeRanking.fixture.ts
    events/
      weeklyEvent.fixture.ts
  helpers/
    db.ts                                 # asUser / asAnonymous / asServiceRole
    auth.ts                               # 测试账号登录与会话
    time.ts                               # 固定时钟，避免测试受真实时间影响
    redact.ts                             # 截图/日志脱敏
```

**目录规则：**
- 组件行为测试（React Testing Library）与被测组件放在一起（`components/domain/__tests__/`），或统一放 `tests/unit/components/`——以 Phase 1 初始化时选定的约定为准，选定后不得两套并存。
- `tests/helpers/time.ts` 提供固定时钟：所有依赖"现在几点"的逻辑都必须在测试中注入时间，否则测试会在某些时刻随机失败。
- 任何新目录的引入都应更新本节。

---

## 11. 本文档与其他文档的关系

| 内容 | 归属文档 |
|---|---|
| 中国大陆连通性的**实际测试记录**（日期、城市、ISP、设备、结果、证据） | `docs/deployment-regions.md` |
| 角色与权限的**策略设计与实现说明** | `docs/permissions.md` |
| 数据库表结构、迁移顺序、约束与索引 | `docs/schema.md` |
| 架构、目录、服务器/客户端边界 | `docs/architecture.md` |
| 需求 → 阶段 → 验证方式的完整映射 | `docs/requirements-traceability.md`（本文档中的测试名称是其引用来源） |
| 重要技术选择的理由 | `docs/decisions/`（ADR） |

---

## 12. 测试相关待确认项（需要产品负责人澄清）

以下问题在编写测试期望值之前必须有明确答案；在此之前，相关测试只能写成"待冻结"状态，不能猜测。它们与主规格第 17 节的开放决策一致：

1. **教练改评分/资格的权限边界**（3.3 与 4 节" If permitted"）：是"默认不可、逐项授权"，还是"默认可"？这直接决定 `tests/integration/rls/coach.rls.test.ts` 中该用例的期望值。
2. **各格式选票的确切字段、分数范围与总分规则**（第 17 节）：决定 `templateValidation.test.ts` 与 `scoreCalculation.test.ts` 的断言。
3. **经理能否修改纯展示性选票文字**（第 17 节）：决定是否存在"经理编辑已提交选票"的允许用例，以及审计要求。
4. **裁判是否有独立的显式签到动作**，还是"可用性获批"即视为就绪（第 17 节）：决定 `tests/unit/judges/judgeRanking.test.ts` 中 `checkedIn` 过滤条件的语义。
5. **分配是确认即刻可见，还是需要一次单独的发布动作**（第 17 节）：决定 J4 与 J7 的 E2E 步骤与"未发布时学生看到什么"的断言。
6. **裁判排名公式的平局规则**：主规格第 10.3、10.5 节给出了队伍与边/位的确定性平局规则，但第 11 节的 `judge_cost` 没有明说。本文档暂按"按裁判 UUID 升序"处理，需要确认。
7. **开赛的"紧急绕过（Emergency override）"具体流程**（4 节）：谁可以操作、如何审计、审计哪些字段——目前主规格未展开，因此没有对应测试。
8. **BP 的胜负语义**（6.4 的 `ballots.winner_team_id` 是单个，而 10.4 要求不要退化成二元胜负）：需要明确 BP 的 `placement` 与 `result` 如何填写，才能写出正确的计分测试。

---

## 13. 文档状态声明（重申）

- 本文档是 **Phase 0 的计划文档**，不是测试报告。
- 截至本文档编写时：**没有编写任何测试代码，没有执行任何测试，没有任何测试结果为"通过"。**
- 所有"应断言""预期""计划"均为将来时。
- 任何阶段的完成报告如果写"测试通过"，必须同时给出**实际执行的命令与其输出**；未运行的检查必须如实标注"未运行"及原因（主规格第 14.6 节、`AGENTS.md` Testing Rules）。
