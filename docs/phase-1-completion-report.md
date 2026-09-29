# INSPIRA V1 — Phase 1 完成报告

- 报告日期：2026-09-29
- 对应计划：[`docs/phase-1-plan.md`](./phase-1-plan.md) 的 P1-1 … P1-13
- 状态：**P1-1 … P1-11、P1-13 已完成；P1-12 未执行（涉及付费，等待产品负责人明确批准）**
- 本报告中的每一个数字与命令结果均来自**实际执行**，不是推断。推断与未验证之处在文中单独标出。

---

## 1. 一句话结论

Phase 1 的地基已经建成并且**可验证**：11 个数据库迁移能从空库一次性重放，15 张表全部启用 RLS 并有 32 条策略，
112 个单元测试与 70 条数据库用例全部通过，生产镜像能构建并运行，
而且"浏览器不直连认证服务""不引用境外资源""service-role 不进客户端"这三条关键约束都有**会真的失败的自动检查**。

同时有若干事项**明确没有做完**，见第 8 节。其中最重要的是 P1-12（大陆冒烟测试）未执行，
因此"中国大陆可以正常使用"这一条**至今仍是假设，不是已证实的事实**。

---

## 2. 变更内容（按步骤）

| 步骤 | 内容 | 结果 |
|---|---|---|
| P1-1 | 项目脚手架、仓库规范、依赖锁定、内部禁令 | ✅ |
| P1-2 | 界面基础与可访问外壳（五态组件、地标、跳过导航） | ✅ |
| P1-3 | 环境变量与启动校验（缺变量则启动失败） | ✅ |
| P1-4 | 本地开发数据库（Supabase 全栈，12 容器） | ✅ |
| P1-5 | 核心结构迁移与种子数据 | ✅ |
| P1-6 | RLS 策略与权限测试（含 38 条禁止用例的覆盖计划） | ✅ |
| P1-7 | 三种 Supabase 客户端与中间件会话刷新 | ✅ |
| P1-8 | 认证流程（注册/登录/登出/找回/重置）+ 自有域名邮件链接 + 限流 | ✅ |
| P1-9 | 角色感知路由与受保护区域（真实 403/307） | ✅ |
| P1-10 | Docker 生产构建、compose、健康检查端点 | ✅ |
| P1-11 | CI 质量门禁（两个 job，门禁本身也被验证会失败） | ✅ |
| P1-12 | 非生产部署与大陆冒烟测试 | ⏸ **未执行**（付费，待批准） |
| P1-13 | 文档更新与完成报告 | ✅ 本文件 |

---

## 3. 交付物清单

### 3.1 数据库迁移（11 个，从空库按序重放）

```text
supabase/migrations/
  20260929090000_extensions_and_helpers.sql
  20260929090100_enums.sql
  20260929090200_identity.sql
  20260929090300_formats.sql
  20260929090400_qualifications.sql
  20260929090500_events.sql
  20260929090600_registration.sql
  20260929091100_ops.sql
  20260929091200_indexes.sql
  20260929091300_rls.sql
  20260929091400_rate_limiting.sql
```

> ⚠️ 迁移文件名**必须**匹配 `<时间戳>_<名称>.sql`，否则 Supabase 会**静默跳过**。
> 这是实测踩到的坑：最初用描述性文件名，`supabase db reset` 只打印一行
> `Skipping migration ... (file name must match pattern)` 就继续了，没有任何报错。

### 3.2 数据库对象（实测，非估算）

| 对象 | 数量 |
|---|---:|
| 表（public） | **15** |
| 启用 RLS 的表 | **15**（全部） |
| RLS 策略 | **32** |
| 索引 | **41** |
| 函数 | **22** |
| 枚举类型 | **6** |
| 触发器 | **15** |
| 种子数据 | 5 种赛制 + 12 个位置代号 |

15 张表：`audit_logs`、`debate_formats`、`event_formats`、`events`、`format_positions`、
`judge_format_qualifications`、`judge_profiles`、`profiles`、`rate_limit_counters`、
`registration_format_preferences`、`registrations`、`student_format_profiles`、`student_profiles`、
`system_settings`、`user_roles`。

> 📌 **纠正一处文档陈旧数据：** `docs/schema.md` 与 `docs/phase-1-plan.md` 原先写的是
> "14 张表、40 个索引、19 个函数"——那是 **P1-5 时点**的实测值。
> 之后 P1-8 新增了 `rate_limit_counters` 表与 `consume_rate_limit`、`prune_rate_limit_counters` 两个函数，
> 数量因此变为 15 / 41 / 22。已在本步更正（这正说明"文档与实现对齐"必须放在最后一步做）。

### 3.3 应用代码

| 类别 | 内容 |
|---|---|
| 环境校验 | `lib/env/server.ts`（5 个必需 + 3 个可选）、`lib/env/client.ts`、`instrumentation.ts` |
| Supabase 客户端 | `lib/supabase/server.ts`（用户身份）、`admin.ts`（service-role + `server-only`）、`client.ts`（浏览器）、`database.types.ts`（生成） |
| 会话与授权 | `lib/auth/session.ts`（`requireSession` / `requireAnyRole`）、`lib/auth/roles.ts`（角色→落地页/区域权限/导航） |
| 认证动作 | `lib/auth/actions.ts`（5 个 Server Action）、`lib/auth/form-state.ts`、`lib/auth/rate-limit.ts` |
| 路由 | `app/auth/confirm/route.ts`、`app/api/health/route.ts` |
| 页面 | 4 个认证页 + `/dashboard` + 5 个区域（`/student` `/judge` `/coach` `/manage` `/admin`）+ `app/forbidden.tsx` |
| 组件 | `components/layout/app-shell.tsx`、`role-nav.tsx`、`components/domain/state-panel.tsx`、`form-field.tsx`、`form-message.tsx`、`area-placeholder.tsx` |
| 邮件模板 | `supabase/templates/recovery.html`、`confirmation.html`（内联样式，无外部资源） |
| 部署 | `Dockerfile`（三阶段）、`.dockerignore`、`docker-compose.yml`（app + cron）、`.github/workflows/ci.yml`、`.nvmrc` |

### 3.4 文档

`AGENTS.md`（从规范附录 A 逐字提取）、`docs/architecture.md`、`schema.md`、`permissions.md`、
`testing.md`、`requirements-traceability.md`、`deployment-regions.md`、`dependencies.md`、
`phase-1-plan.md`、`decisions/`（ADR-0001 … **0012**）、`OWNER_GUIDE.md`、`NEXT_STEP.md`。

规模：源码 67 个文件 / 约 4,380 行；文档约 6,827 行。

---

## 4. 决策与偏差

### 4.1 本阶段新增的架构决策（ADR）

| ADR | 内容 |
|---|---|
| 0009 | 产品负责人确认的默认值（25 项全部同意） |
| 0010 | 依赖版本锁定策略 |
| 0011 | UI 层选型（shadcn/ui）与境外资源自动化防护 |
| **0012** | **应用层频率限制采用数据库固定窗口计数器** |

### 4.2 与计划的偏差（均已记录理由）

| 偏差 | 原因 |
|---|---|
| 单元测试用 Vitest 组件测试，**未**使用计划中提到的 `tests/integration/rls/*.rls.test.ts` 文件布局 | 本机没有 `psql`。改为把全部权限断言放在 `scripts/db-tests.sql` 里通过 `docker exec` 执行。**能力没有减少**（可以逐条断言"允许/拒绝"），但文件组织与计划不同，追溯表已相应说明 |
| 认证邮件链接改用**自定义模板 + 自有域名** | 实测默认模板的链接指向 `127.0.0.1:54321`（认证服务本身），生产会是 `*.supabase.co`。这正是 ADR-0007 担心的跨境依赖，因此改为 `{SiteURL}/auth/confirm` |
| 移除了根级 `app/loading.tsx` | 实测它会让 `redirect()` 与 `forbidden()` 退化为 200 + `<meta refresh>`。详见 5.3 |
| 限流实现为 P1-8 的一部分（原计划归 Phase 9） | 登录与找回密码是 Phase 1 的交付内容，若不加限流则这两个端点可被暴力破解与邮件轰炸 |

### 4.3 被否决的做法与理由（避免以后重复讨论）

- **不用本地 `psql`**：本机没有，且引入它会让"测试怎么跑"依赖个人环境。改用 `docker exec`。
- **不引入 Redis 做限流**：规范第 5.1 节要求不引入无必要依赖，且会增加一个境外依赖点。
- **不把镜像源写进 `Dockerfile`**：会让镜像不可移植。镜像源属于 CI/本机配置。
- **不用跳转页代替 403**：跳转页状态码是 200，监控与日志无法区分"页面不存在"与"没有权限"。

---

## 5. 实际运行的命令与真实结果

### 5.1 完整检查（`npm run ci`）

```text
format:check                   退出码 0 ✅
lint                           退出码 0 ✅
typecheck                      退出码 0 ✅
test                           退出码 0 ✅   （8 个文件 / 112 个用例通过）
build                          退出码 0 ✅
check:no-third-party           退出码 0 ✅
check:browser-no-auth-service  退出码 0 ✅
check:server-only              退出码 0 ✅
```

### 5.2 数据库（`npm run db:verify`）

```text
Applying migration 20260929090000_extensions_and_helpers.sql ...
（11 个迁移全部重放）
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch main.

[授权] ---- 通过 36 条，失败 0 条 ----
[约束] ---- 通过 11 条，失败 0 条 ----
[匿名] ---- 通过 14 条，失败 0 条 ----
[限流] ---- 通过  9 条，失败 0 条 ----
 ✓ 数据库测试套件全部通过，虚构数据已清理
退出码 0
```

### 5.3 关键性质的**实测**验证（这些不是"设计如此"，是"跑出来是这样"）

**① 浏览器不直连认证服务（ADR-0007）**

| 扫描目标 | 命中 |
|---|---:|
| 浏览器端产物中的认证调用 | **0** |
| 浏览器端产物中的 Supabase 域名 | **0** |
| 服务端产物中同样模式（**反向确认**，防止检查空转） | 5 / 4 个文件 |

**② 认证邮件链接指向自有域名**

先用**默认**模板触发真实重置邮件，从 Mailpit 读出链接主机为 `127.0.0.1:54321`（认证服务本身）。
换自定义模板后，链接变为 `127.0.0.1:3000/auth/confirm?token_hash=…`。
用该真实 token 访问 → **307 到 `/reset-password`，并下发会话 cookie**。

**③ 角色访问矩阵（真实会话，30 条断言全部通过）**

| 角色 | `/dashboard` | student | judge | coach | manage | admin |
|---|---|---|---|---|---|---|
| student | 307 → /student | **200** | 403 | 403 | 403 | 403 |
| judge | 307 → /judge | 403 | **200** | 403 | 403 | 403 |
| coach | 307 → /coach | 403 | 403 | **200** | 403 | 403 |
| club_manager | 307 → /manage | 403 | 403 | 403 | **200** | 403 |
| super_admin | 307 → /admin | 403 | 403 | 403 | **200** | **200** |

未登录访问六个受保护前缀一律**真正的 307 → /login**。

**④ Docker 镜像**

| 项目 | 结果 |
|---|---|
| `docker build` | 退出码 0，镜像 **295 MB** |
| 容器状态 | **healthy** |
| `GET /api/health`（容器内 → 宿主机数据库） | **200**，`{"status":"ok","database":"ok","latencyMs":19}` |
| 容器内带真实会话访问 `/dashboard` | **307 → /student**（证明中间件在容器内向 Supabase 校验了会话） |
| 运行用户 | `uid=1001(nextjs)` —— **非 root** |
| 镜像内 `.env` / 源码 / `supabase/` | 均不存在；按值精确搜索真实 service-role 密钥**未找到** |

**⑤ 门禁本身会失败（"一个从没失败过的检查不算检查"）**

| 故意引入的问题 | 门禁 | 实测退出码 |
|---|---|---|
| `primaryRole` 返回类型改成 `number` | `typecheck` / `ci` | **1**（报出真实 TS2367、TS7053） |
| 追加一行格式混乱的代码 | `format:check` | **1** → 还原后 0 |
| 追加一个未使用的导出常量 | `lint` | **1** → 还原后 0 |
| 前端引入真实 `signInWithPassword` 调用 | `check:browser-no-auth-service` | **1** → 还原后 0 |
| 注入 Google Fonts `@import` | `check:no-third-party` | **1** → 还原后 0 |
| 客户端组件引用 service-role 客户端 | `check:server-only` | **1**（构建失败） |

**⑥ 干净环境（模拟 CI）**

在 `node:24-alpine` 容器里，**不挂载**宿主 `node_modules`、**排除 `.env.local`**，
执行 `npm ci` + `npm run ci` → **退出码 0**。

---

## 6. 手工验证步骤（给产品负责人或后续实现者）

前置：Docker 已启动；在仓库根目录执行。

```bash
# 1. 起数据库
export HOME="$PWD/.sb-home"     # 本机沙箱需要；普通终端可省略
npx supabase start

# 2. 跑全部自动检查（约 3–5 分钟）
npm run ci

# 3. 跑数据库测试（从空库重放迁移 + 70 条用例）
npm run db:verify

# 4. 手动看一眼界面
npx next dev
#   打开 http://127.0.0.1:3000
#   - 首页应展示五种状态（加载/空/错误/无权限/成功）
#   - /register 注册一个学生账号 → 应自动进入 /student
#   - 直接访问 /admin → 应看到「没有访问权限」且状态码 403
#   - 退出后访问 /dashboard → 应跳转到 /login
#   - 键盘按 Tab → 第一个可聚焦元素应是「跳到主要内容」

# 5. 邮件与重置流程
#   打开 http://127.0.0.1:54324 （Mailpit）
#   在 /forgot-password 输入已注册邮箱 → 邮件主题应为中文
#   邮件里的链接应指向 http://127.0.0.1:3000/auth/confirm...（不是 54321）

# 6. Docker
docker compose build
docker compose up -d app
curl http://127.0.0.1:3000/api/health     # 应返回 {"status":"ok","database":"ok",...}
docker compose down
```

---

## 7. 已知限制与风险

| # | 限制 | 影响 | 处理 |
|---|---|---|---|
| L-1 | **P1-12 未执行**：大陆冒烟测试没做 | "中国大陆可用"仍是**假设** | 需要产品负责人批准费用后才能验证 |
| L-2 | 限流只验证到"机制正确 + 动作按正确顺序调用"，**未**完成真实 Server Action 的端到端触发 | 限流接线若被改坏，只有源码级测试会红 | 建议在浏览器手工确认一次；Phase 9 补集成测试 |
| L-3 | Playwright 浏览器**未安装**，E2E 未运行 | 响应式视觉（375px / 1440px）**未验证** | 需要下载浏览器或人工审阅 |
| L-4 | 38 条禁止用例中 **23 条**依赖尚未创建的表 | 这 23 条现在无法测 | 随所属表在 Phase 2–9 加入（映射见 `docs/permissions.md` §6.0） |
| L-5 | 本地 Supabase 服务绑定 `0.0.0.0` 且 Studio/pgMeta/analytics **无认证** | 同网络他人可访问本地数据 | **只放虚构数据**；已多次提醒 |
| L-6 | 第 4 节权限矩阵与 §3.3、§17 存在**原文冲突**（教练能否改分） | 影响 Phase 8 实现 | 已在追溯表标为 A-01，等待负责人澄清 |
| L-7 | CI workflow **未在 GitHub 上真正跑过**（仓库无远程） | 首次推送时可能有 YAML 层问题 | 已在干净容器里用相同命令验证 |
| L-8 | 本机 Docker Hub 不可达、`docker build` 需指定 `DOCKER_CONFIG` | 只影响本机 | 已在架构文档 17.1 记录，非项目要求 |

---

## 8. 尚未完成的开放事项（需要产品负责人输入）

这些不影响 Phase 1，但会阻塞后续阶段：

| # | 需要澄清什么 | 阻塞 |
|---|---|---|
| O-1 | **五种赛制的选票字段与评分区间** | Phase 7 |
| O-2 | 报名时间偏移与提醒时间表 | Phase 3 / 9 |
| O-3 | 域名注册商与最终域名 | Phase 12 部署 |
| O-4 | 月度预算上限 | P1-12 及之后所有付费步骤 |
| O-5 | 隐私政策与法律审阅 | 上线前 |
| O-6 | 教练能否修改学生评分（§4 与 §3.3/§17 冲突） | Phase 8 |
| O-7 | 邮件服务商选型 | Phase 9 |

---

## 9. 文档与 `AGENTS.md` 是否仍然准确？

**是，但有一处需要说明。**

- `AGENTS.md` 的 121 行是从规范附录 A **逐字提取**的，本阶段**没有修改**过它。
  它规定的约束（不得引入境外资源、service-role 仅限服务端、权限测试必须尝试禁止操作、
  不得物理删除用户、审计日志只追加等）在本阶段**全部被遵守**，并且其中三条已经被自动检查固化。
- `docs/schema.md` 与 `docs/phase-1-plan.md` 中的对象数量在本步**已更正**（见 3.2 的说明）。
- `docs/requirements-traceability.md` 新增了"阶段 1 实际验证对照"，说明计划的验证方式与
  实际落地方式的差异（主要是 RLS 测试的文件组织）。
- `docs/testing.md` 第 8 节已重写为实际的 CI 内容。
- `docs/architecture.md` 新增 6.5（受保护路由与状态码）与 17.1（Docker 实测要点）。

**结论：文档与 `AGENTS.md` 与当前实现一致。** 唯一"不一致"是追溯表中部分**未来阶段**的行
仍引用计划中的测试文件名（如 `tests/integration/rls/*.rls.test.ts`），那些阶段尚未实施，
在实施时应改为实际文件名——已在追溯表的新增章节中说明这一点。

---

## 10. 下一步

**Phase 1 到此结束。** 按 `AGENTS.md` 与计划要求，**在此停下，等待产品负责人批准进入 Phase 2**。

Phase 2 的内容是：超级管理员与俱乐部的活动/赛制/用户与角色管理。
开始之前建议先确认第 8 节的 O-6（教练权限冲突）与 O-1（选票字段），
它们分别影响 Phase 8 与 Phase 7，但不阻塞 Phase 2 的开头部分。
