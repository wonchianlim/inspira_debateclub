# 交接文档（新会话从这里开始）

> 最后更新：2026-10-01（UI/UX 阶段 3b 完成）。**本节之上是历史记录，可以只看这一节。**

---

## 一分钟了解现状

**INSPIRA 辩论社管理系统已经上线并在真实使用。**

```
生产网址   https://app.inspira.education
数据库     Supabase Pro（新加坡），35 张表，29 个迁移
网站       Vercel Pro（绑定自定义域名 —— vercel.app 在大陆被 DNS 污染）
邮件       Resend，发件人 noreply@mail.inspira.education（QQ 邮箱实测收到）
代码       GitHub 私有仓库 wonchianlim/inspira
成本       $45/月
超管账号   wonchianlim@outlook.com
```

**仓库**：`/Users/chianlim/Documents/deepseek-harness/default-workspace/inspira`

---

## 🔴 立刻要做的第一件事

### ⚠️ 顺序不能反：先把两个新迁移推到生产库，再推代码

这一轮加了 **2 个数据库迁移**（见下节）。其中「活动地点」那一列，
**新代码会去读它** —— 如果先推代码、后跑迁移，活动页会直接报错
（列不存在）。

所以顺序是：

```bash
# ① 先应用迁移（加了 venue 列 + 签到窗口触发器，都是只增不减）
cd /Users/chianlim/Documents/deepseek-harness/default-workspace/inspira
npx supabase link --project-ref owkntjvfsrrjuithgdtq
npx supabase db push

# ② 再用 GitHub Desktop 点 Push origin（会触发 Vercel 部署）
```

> 上面 `db push` 只需要做一次。**做完之后**才推送代码。
> 现阶段生产库有 31 个迁移，本地演练跑 255 条数据库用例。

### 然后检查未推送的提交

```bash
git log origin/main..HEAD --oneline
```

有的话让产品负责人用 **GitHub Desktop** 点 `Push origin`
（我没有仓库凭据，推送会失败 —— 这是正常的，不要反复重试）。

⚠️ **推送会触发 Vercel 自动部署，线上界面会变。**
推之前请先读「颜色会怎么变」那一节，以便向产品负责人说清楚会看到什么。

---

## 当前正在进行的工作：UI/UX 改造

规范：`/Users/chianlim/Documents/Codex/2026-10-01/referenced-chatgpt-conversation-this-is-an/outputs/inspira-debate-club-ui-ux-spec.md`
计划：`docs/ui-ux-improvement-plan.md`

| 阶段 | 状态 |
|---|---|
| 1 设计令牌底座 | ✅ 完成（含对比度自动化测试） |
| 2 应用外壳 / 角色感知导航 | ✅ 完成 |
| 3 状态体系 `StatusBadge` | ✅ 完成（含对比度自动化测试） |
| 3b 迁移 52 处旧 `<Badge>` | ✅ 完成 —— 全项目页面里已 0 处 `<Badge>` |
| **4 页面级改造** | ⏳ **进行中 —— 4b 学生端已开始，详见下节** |
| 5 路由改名（`/dashboard`→`/home` 等） | ⏳ **最后做，必须保留旧路径跳转** |
| 6 i18n 第 2–4 批 | ⏳ **推迟到阶段 4 之后**（否则文案搬两遍） |

---

## 本轮完成的两件事（2026-10-01，产品负责人拍板）

### ✅ A. 签到窗口现在**真的**被强制了

**问题**：规范第 2.8 节写着「签到在活动开始前 30 分钟开放」，但
**没有任何地方**强制它 —— `studentCheckInAction` 只检查"报名了、没签到过、
报名没取消"，数据库里也只有一条限制"谁能写 `admin` 这个值"的触发器。
学生可以在活动开始**一周前**点签到并且成功，而页面上写着 30 分钟。

**做法（两层都堵）**：

| 层 | 位置 | 作用 |
|---|---|---|
| 数据库 | 迁移 `20261001090000_check_in_window.sql` 的 `enforce_check_in_window` 触发器 | 真正的保证。绕过服务端直接调 PostgREST 也签不了到 |
| 服务端 | `lib/admin/check-in-actions.ts` | 给用户一句能看懂的中文（含**这次活动**的签到开放时刻） |
| 界面 | `app/(app)/student/events/[eventId]/` | 窗口没开放时**不显示按钮**，改为告诉学生什么时候开放 |

**⚠️ 两处刻意的取舍，都需要产品负责人知道**：

1. **管理员代签仍然豁免窗口**。规范第 2.8 节明文要求保留人工通道
   （"staff can check them in manually"），它的用途正是"学生到了现场但手机没电"。
   因此触发器只约束学生自助签到（`check_in_method = 'self'`）。
   用例 `A36` 固定住这个豁免。**如果要连管理员也挡住，告诉我。**
2. **窗口读的是 `events.check_in_opens_at`，不是"开始前 30 分钟"那个常量**。
   「30 分钟」只是新建活动时的默认值，管理员可以在系统设置里改掉它。
   原来现场看板用的是写死的 30 分钟（一个**真 bug**：管理员改过设置后，
   看板会说"签到已开放"而数据库会拒绝）—— 已改读那一列，
   并按"只留一处规则"的原则删掉了 `lib/domain/live-status.ts` 里那个错的
   `isCheckInOpen(startsAt, now)`，统一到 `lib/domain/registration.ts` 的
   `isCheckInOpen(checkInOpensAt, now)`。

**验证**：`npm run db:verify` 通过（255 条，含 3 条新增）。
**反向验证**：把触发器删掉 → `F-STU-43`（窗口外签到）立刻从 PASS 变 FAIL；
重放迁移后恢复通过。

### ✅ B. 活动加了「地点」字段

**问题**：规范 §8.1/§8.2 要求显示场地/线上，但 `events` 表从 Phase 1 起
只有会议链接、**没有场地列** —— 线下活动只能把地点写在"活动说明"那段自由文字里。

**做法**：迁移 `20261001090100_event_venue.sql` 加 `venue text`（可空，200 字上限）。
写入路径：Zod 校验 → 创建/编辑/克隆动作 → 管理端表单多一个「线下场地」输入框。
显示路径：`lib/domain/event-location.ts` 的 `describeEventLocation()` ——
**四个地方共用这一条规则**（管理端活动详情、学生活动列表、学生活动详情、学生首页 hero）。

显示规则：有场地 → 显示场地；只有链接 → 「线上」；两者都没有 → 「地点待定」
（不显示空白，空白会让人以为界面坏了；草稿阶段两者都可能还没定）。

**⚠️ 两处产品决定，我按"规范没写就不自己定"处理**：

1. **场地与链接都是可选的**，也没有"至少填一个"的约束 ——
   规范没有这条要求，而管理员在活动还是草稿时本来就可能两者都没定。
2. **两者都有时显示场地**（线下为主、同时开直播的情况）。
   链接在活动详情页仍然单独、完整地列出来，不会丢。

**验证**：反向验证过 —— 改坏 `describeEventLocation` 会让 4 条测试失败
（含 hero 组件测试）。

### 🔍 顺带发现：两条数据库用例一直在**假通过**

`C35`（我这轮新写的场地长度用例）即使**把约束删掉**也照样 PASS。
原因：它的 `event_date` 与 `starts_at` 不一致，于是事件日期触发器**先**报错，
测试"通过"了，但测的根本不是场地上限。

顺着这条线查下去，**原有的 `C05`（报名截止晚于开始时间）是同一个毛病** ——
它在约束被删掉时也会 PASS。

两条都已修正（把 `event_date` 与 `starts_at` 对齐），并**逐条反向验证**：
同时删掉两条 CHECK 之后，`C05` 与 `C35` 都如期 FAIL。

> 这正是本项目那条规则的实例：**无法失败的测试和一个通过的测试长得一样。**
> 上一轮我在 `live-status.test.ts` 里也删掉过一个按写死 30 分钟计算的函数，
> 理由相同。

---

## 阶段 4 进度（2026-10-01）

### ✅ 4b-1 学生首页 `/student`（规范 §8.1）

**这一页原来是一张会说假话的页面。** 它叫「学生区域」，是一张手写的功能清单，
上面写着 签到「待建设 · Phase 6」、我的评分表「待建设 · Phase 7」、
我的历史「待建设 · Phase 8」—— 而这三个功能**当时全部已经做完并且在线上可用**。
学生看到的是"这些还没做"，可它们就在导航里。

原因与页脚曾经那句「当前为 Phase 1」一模一样：手写的进度文字写在更早的阶段，
之后没有人回头改，**也没有任何测试会去看它**。

现在它是规范 §8.1 的首页：问候 → 下一场 hero → 最多三张指标 → 最近反馈 →
即将到来的活动 → 最近动态；什么都没有时给引导而不是空白框。
页面上的每一样都是**查出来的数据**，没有会过期的进度文字。

新增的文件：

| 文件 | 作用 |
|---|---|
| `lib/domain/greeting.ts` | 按时段问候（规范：不许写死问候语，要有回退） |
| `lib/domain/student-home.ts` | 首页的五个判断：下一场 / 主按钮 / 指标取舍 / 主要赛制 / 是否新学生 |
| `components/domain/next-debate-hero.tsx` | 深蓝 hero（规范要求的主操作 + 次操作） |
| `lib/domain/timezone.ts` | 新增 `zonedHourOf()` |
| `lib/student/registrations.ts` | `StudentEventCard` 增加 `checkInOpensAt` |

### ✅ 4b-2 学生活动列表 `/student/events`（规范 §8.2）—— 完成

- 页面标题与说明、**一个**状态 chip（按处境显示"已报名"或报名窗口）、
  按处境变化的**一个**主操作（去报名 / 查看详情）；
- **`即将到来 / 已结束` 分段**（带条数，"已结束"用规范要求的紧凑行样式）；
- **三组筛选**：赛制（选项来自学生真正看得见的活动）、形式（全部/线上/线下）、
  报名（全部/我已报名/未报名）；
- 规范的两种空状态：「没有符合条件的活动」+ 清除筛选，与
  「目前没有即将开始的活动」分开；
- 窗口文案抽成共享常量 `REGISTRATION_WINDOW_LABELS`（原来手抄在页面里）。

**做法：全部用网址参数，没有客户端组件。**
判断逻辑在 `lib/domain/student-events-view.ts`（19 条测试），页面只管画。
好处：仍然服务端渲染、链接可以直接分享、浏览器后退键天然可用。

**⚠️ 两处与规范的差异（刻意的，需要产品负责人知道）：**

1. **没有做"移动端筛选抽屉"**。规范 §8.2 说筛选在小屏上
   "collapse into filter sheet"。这里做成三行可换行的链接组：
   它不需要任何 JS、也不需要额外的焦点管理，而"点一下就能筛"这个好处已经拿到。
2. **没有做搜索**。规范原文是 "Search only if event volume justifies it" ——
   现在的活动数量远没有到需要搜索的程度，做了反而是干扰。

### ⏳ 4b-3 / 4b-4（还没开始）

- 4b-3 活动详情 `/student/events/[eventId]`：规范 §8.3 的 hero 摘要
  （标题/状态/日程/时区/地点/赛制/报名截止 + 角色化 CTA）+ 分节
  （关于这场活动 / 时间安排 / 资格与赛制 / 我的报名 / 重要信息）。
- 4b-4 我的评分表 `/student/ballots`：规范 §8.7 的可读文档式版面。

### ✅ 阶段 4b 一度发现的两个数据模型缺口 —— 都已由产品负责人拍板并修好

1. ~~活动没有"地点"字段~~ → **已加**（迁移 `20261001090100_event_venue.sql`，见上面 A/B 两节）。
2. ~~签到窗口没有在服务端或数据库强制~~ → **两层都堵上了**
   （迁移 `20261001090000_check_in_window.sql`）。

---

## 待产品负责人决定

> 上一轮列的四个问题里，**签到强制**与**地点字段**已经由产品负责人拍板并做完
> （见上面两节）。剩下的：

1. ⚠️ **管理员代签要不要也受签到窗口限制？**
   现在是**豁免**的：学生自助签到受窗口限制，管理员代签不受限。
   理由是规范第 2.8 节明文要求保留人工通道（"staff can check them in manually"），
   它的用途正是"学生到了现场但手机没电"。
   如果你希望连管理员也只能在窗口内代签，说一声（删触发器里一个判断即可）。

2. **`OWNER_GUIDE.md` 已过期**（开头写"还没有可运行的系统"，实际早已上线）。
   要不要我重写？（我建议等阶段 4 做完一起写，免得写两遍。）

3. **阶段 4 剩下的部分按什么顺序做？**
   我建议：4b-3 活动详情 hero 摘要 → 4b-4 我的评分表可读版面 → 然后 4c 裁判端。
   也可以先跳到 4c，由你定。


---

## 阶段 3b 做了什么（下一次不要再重复劳动）

### 三个新/改的组件与模块

| 文件 | 作用 |
|---|---|
| `components/domain/status-badge.tsx` | 语气 → 颜色的**唯一**出口。已扩成规范 §13.4 的 **7 个语气** |
| `components/domain/status-tone.ts` | **业务状态 → 语气**的映射表。这是本次的核心产物 |
| `components/domain/meta-chip.tsx` | 中性元数据标签（赛制代码、队伍名、角色名……） |

**为什么要有 `status-tone.ts`：**
只把 `<Badge>` 换成 `<StatusBadge>` 并没有解决问题 —— 那只是把"调用方挑颜色"
从 `variant=` 搬到了 `tone={...}`，同一个"已发布"照样能在三个页面是三种颜色。
真正管用的是：**同一个业务状态，全站只有一种颜色，而且只写一次。**

所以页面里现在长这样：

```tsx
<StatusBadge tone={eventStatusTone(event.status)}>{EVENT_STATUS_LABELS[event.status]}</StatusBadge>
<MetaChip>{format.code}</MetaChip>
```

**页面里不要直接写 `tone="success"` 之类的字面值**，除非它真的只是一个孤立标签
（例如现场看板的「超时未开始」）。有新状态就往 `status-tone.ts` 里加一行。

### 52 处的分类结果（实际数字，不是估的）

| 类别 | 数量 | 归属 |
|---|---|---|
| 真状态 | **28** | `<StatusBadge tone={...映射函数...}>` |
| 元数据标签 | **24** | `<MetaChip>` |

### 语气表（规范 §13.4，**产品负责人 2026-10-01 拍板以规范为准**）

| 规范里的 Status family | 我们的语气 | class |
|---|---|---|
| Neutral（草稿、已归档、未开始） | `neutral` | `bg-neutral-bg text-muted-foreground` |
| Information（已发布、配对已放出） | `info` | `bg-info-bg text-info` |
| Attention（报名开放、需要你处理） | `attention` | `bg-brand-tint text-foreground` |
| Pending（待审批、已排定） | `warning` | `bg-warning-bg text-warning` |
| Success（已报名、已提交、已完成、已批准） | `success` | `bg-success-bg text-success` |
| Active（进行中、Live、当前使用） | `active` | `bg-primary text-primary-foreground` |
| Error（失败、冲突、已拒绝、已取消） | `danger` | `bg-danger-bg text-danger` |

> ⚠️ **原来的 `brand` 语气已删除**（它与 `attention` 完全重复，而且"品牌色"不是一种状态）。
> 原来的 6 语气说法在本文档与代码里都已作废，只剩上面这 7 种。

### ⚠️ 几处**刻意**的判断（不是机械替换，别改回去）

| 状态 | 语气 | 理由 |
|---|---|---|
| 报名「已取消」 | `neutral` | 规范 §9.2：截止前取消**无惩罚**。染红等于在骂合规操作 |
| 报名「已取消（迟）」 | `warning` | 它会影响历史记录，是提醒 |
| 账号「已停用」 | `neutral` | 毕业/退社是正常结束（规范：Archived）。**迁移前它是红色** |
| 账号「已暂停」 | `danger` | 违规停用才是坏消息。原来与"已停用"同为红色，分不开 |
| 评分表「已发布」 | `info` | 规范 §13.4 把 Published 放在 Information，不是 Success |
| 现场看板「有缺人」 | `danger` | Error: Conflict，要立刻处理 |
| 审计「新增/修改」 | `neutral` | 只有「删除」是红色，满屏红等于没有红 |
| 第 N 名（BP 名次） | `neutral` | 名次是数据，不是"成功"；绿色只留给胜利 |

### 新的自动化防线

- `tests/unit/status-tone.test.ts` —— 把上面每一条判断都锁住，改坏就失败。
- `tests/unit/status-badge.test.tsx` —— 从组件**真实渲染的 class** 反查 `globals.css`
  算出对比度，7 种语气都要求 ≥ 4.5:1。
  ⚠️ **最紧的是 `neutral`：4.51:1**，只比 AA 高一点点 —— 改 `--neutral-bg`
  或 `--text-muted-token` 之前先看这条测试。
- `tests/helpers/design-tokens.ts` —— 令牌读取与对比度换算的**唯一实现**
  （两个测试文件共用，避免"一份被改坏、另一份仍然通过"）。

### 顺带修掉的两处类型漏洞（为去掉 `as` 断言）

- `lib/judge/profile.ts`：`approvalStatus: string` → `JudgeApprovalStatus`
- `lib/judge/ballots.ts`：`ballotStatus: string | null` → `BallotStatus | null`（两处）

### 本次没有做（记在这里，别以为是漏了）

- **没有部署**。只提交到本地仓库，等产品负责人 Push。
- **没有跑 `db:verify`**：本次不含任何数据库改动，因此没做删库重建。
- **没有动 `OWNER_GUIDE.md`**：它已经明显过期（头部写"还没有可运行的系统"，
  而系统早已上线）。重写它是一件事先要产品负责人拍板的事，见「待产品负责人决定」。
- **没有合并重复的中文文案表**：`JUDGE_APPROVAL_LABELS` 在
  `lib/domain/judge-eligibility.ts`、`app/(app)/judge/profile/page.tsx`、
  `app/(app)/admin/users/[profileId]/page.tsx` 各有一份（措辞还不同）。
  合并是"同一套词汇"的自然延伸，但会改动用户可见文案，留待阶段 4。

---

## 颜色会怎么变（推送后线上会看到的）

推送即部署，**状态徽章的颜色会变**。挑几个最容易被注意到的：

| 界面 | 原来 | 现在 |
|---|---|---|
| 活动「报名开放中」 | 灰 | **橙** |
| 活动「进行中」 | 灰 | **深蓝底白字** |
| 活动「已完成」 | 灰 | **绿** |
| 账号「已停用」 | **红** | **灰** |
| 裁判「待审批」 | 灰 | **琥珀** |
| 评分表「已发布」 | 灰 | **蓝** |
| 现场看板「已完成」 | 灰 | **绿** |
| 复核请求「待处理」 | 深蓝 | **橙** |
| 通知「定时发布」 | 灰 | **琥珀** |
| 模板「当前使用」 | 灰 | **深蓝底白字** |

元数据标签（赛制代码 `BP`、队伍名、角色名、房间号、铁人）**外观不变**，
仍是描边药丸形。只有 3 处原本用灰底的地方统一改成了描边
（`当前使用` 改成了深蓝状态徽章、`只有你能看到`、`可执裁赛制`）。

---

## 命令速查

```bash
npm run check        # 九步检查链（format/lint/typecheck/test/build/四项静态检查）
npm run db:verify    # 删库重建 + 重放迁移 + 251 条数据库用例
npm run test:integration
npm run db:test
```

**环境注意**（这台机器上踩过的坑）：

```bash
export HOME="$PWD/.sb-home"          # 否则 supabase CLI 写 ~/.supabase 会 EPERM
export DOCKER_CONFIG="$PWD/.docker-home"
# psql 不在 PATH，要用：
docker exec -i supabase_db_inspira psql -U postgres -d postgres
```

**`.env.local`** 里有 Supabase 本地值与 `RESEND_API_KEY`，**已被 gitignore**。

---

## 这台机器 / 这个项目的硬规则

- **不加载境外浏览器资源**（有守卫测试；字体自托管在 `app/fonts/`，72KB）
- **`"use server"` 文件只能导出异步函数**（常量放 `lib/validation/` 或 `lib/i18n/config.ts`）
- **`.env.local` 里的东西绝不提交、绝不贴进对话**
- **测试反向验证**：改坏实现，测试必须失败。**无法失败的测试和一个通过的测试长得一样。**
- **检查失败时先怀疑检查**（a11y 检查误报过 4 次）
- **不要凭记忆写数值/列名/文件数** —— 数据库会拦，文档不会
- **状态颜色不在页面里现写**，一律走 `components/domain/status-tone.ts`
- **不要在常驻界面里手写"当前进度"** —— 页脚那句「当前为 Phase 1」与
  学生区域那张「待建设 Phase 6/7/8」清单都是同一个错误，
  而且两次都是**上线之后才被发现**。要显示的进度必须是查出来的数据。

---

## 产品负责人的偏好

- **所有面向他的输出用简体中文**
- 区分「我会做」与「你要做」，结尾给四行块
  （你现在只需要做 / 成功时你会看到 / 请回复我 / 我收到后会做）
- **不能花任何钱、不能用真实学生数据**，除非他明确批准
- 遇到需要拍板的事**先问，不要替他决定**

---

## 历史记录（以下是过程，通常不必看）

（原有内容见 git 历史与 `docs/phase-*-completion-report.md`）
