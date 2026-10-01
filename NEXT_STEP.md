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

本次会话一共新增了 **4 个数据库迁移**：

```
20261001090000_check_in_window       签到窗口强制
20261001090100_event_venue           活动地点字段
20261001090200_visible_names         两个"只返回姓名"的函数
20261001090300_ballot_read_scope     评分表读取范围（修漏洞）
```

**如果你上一次的 `db push` 已经做过，那就还剩最后 2 个**（跑 `db push` 会自己算出该应用哪些）。

⚠️ 顺序仍然是**先迁移、后推代码**：新代码会去读 `venue` 那一列、调用那两个姓名函数
——先推代码会直接报错。

所以顺序是：

```bash
# ① 先应用迁移（venue 列、签到窗口触发器、两个姓名函数、评分表读取范围）
cd /Users/chianlim/Documents/deepseek-harness/default-workspace/inspira
npx supabase link --project-ref owkntjvfsrrjuithgdtq
npx supabase db push

# ② 再用 GitHub Desktop 点 Push origin（会触发 Vercel 部署）
```

> 上面 `db push` 只需要做一次。**做完之后**才推送代码。
> 现阶段生产库有 33 个迁移，本地演练跑 262 条数据库用例。

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

## 2026-10-01 追加：公开裁判姓名，以及途中查出的三处问题

产品负责人拍板：**向学生公开"本场裁判是谁"**；
**会议链接不按"时机"隐藏**（保持现在任何登录用户可见 —— 记在这里，
免得以后有人把它当成漏洞"顺手修掉"：那是明确的产品决定）。

### ✅ 裁判姓名现在会显示（学生评分表上）

姓名**不能**用 PostgREST 的嵌入查询取：`profiles` / `judge_profiles` 的 RLS 是**行级**的
（`profiles_select_own_or_staff`），学生读不到别人的档案行，嵌入查询会把姓名
**静默过滤成 NULL** —— 不报错，界面上只是永远显示不出来。

因此新增迁移 `20261001090200_visible_names.sql`，用两个**只返回姓名**的
SECURITY DEFINER 函数：

| 函数 | 返回 | 可见性由谁判断 |
|---|---|---|
| `my_published_ballot_judges()` | `ballot_id, judge_display_name` | 管理员全部；学生只有**自己参与的比赛**、且评分表**已发布** |
| `my_partner_counterparts()` | `request_id, display_name, school` | 只有**与我有关**的搭档请求 |

两者都只 SELECT 姓名/学校这两类列 —— **邮箱、电话永远不出现在返回值里**。
（不能靠放宽 `profiles` 的策略：RLS 只能按行过滤，放宽一行就等于把裁判的邮箱一起交出去；
也不能建"全员姓名"视图：那等于给出可枚举的名单，而搭档功能刻意不提供可浏览的同学名单。）

界面上：评分表显示「裁判：某某」；万一函数拿不到姓名，退回匿名序号（`裁判 1`）。

### 🐞 途中查出并修好三处问题

**1. 搭档请求原来看不到对方姓名（真实缺陷）。**
`lib/student/partners.ts` 用嵌入查询取对方的 `profiles(display_name)`，
而学生读不到别人的 `profiles` / `student_profiles` 行（RLS 行级），
于是对方整行被静默过滤成 NULL，界面只能显示兜底值「（同学）」——
**学生收到"邀请你搭档"时看不到是谁邀请他**。
实测确认：以学生身份查，`partner_requests` 能看到请求，但
`profiles` 与 `student_profiles` 各只看得到自己那一行。
现在改走 `my_partner_counterparts()`，姓名与学校都回来了。

**2. 已发布的评分表原来对**所有登录用户**可见。**
原策略是 `ballots_student_published using (status = 'published')` ——
只实现了"未发布看不到"，**没有**实现"只看自己比赛的"。
而 `docs/permissions.md` 第 141 行与 `F-STU-04` 早就写明了规则：
「学生只能读到已发布、**且自己在该场比赛名单中**的 ballot」。
也就是说这是**已写明需求没被实现**，不是取舍。
新增迁移 `20261001090300_ballot_read_scope.sql`：
把"谁能读这一份评分表"收成 `can_read_ballot()` 一个函数，
`ballots` / `ballot_scores` / `ballot_feedback` 三条策略共用它
（`docs/permissions.md` 要求后两者"随 ballots 的可读性"）。
写入范围**一个字都没有放宽**：仍然是管理员或被指派的裁判。

**3. ⚠️ 用例 `F-JDG-02` 一直是侥幸通过。**
它验证"裁判读不到未被指派比赛的评分表"，而夹具里**一份已发布的评分表都没有** ——
于是"读不到"和"没有可读的"长得一模一样。
本轮为了验证裁判姓名往夹具里加了一份已发布评分表，它立刻从 PASS 变 FAIL，
上面第 2 条才暴露出来。同时补上了**一直缺着的 `F-STU-04`**。

**反向验证**：把旧策略放回去 → `F-STU-04` 与 `F-JDG-02` 立刻 FAIL；
重放迁移后全绿。`F-STU-04`、`F-STU-04b`、`A38` 三条新用例覆盖了
"别人读不到 / 名单内的人读得到"两个方向。

数据库用例：**255 → 262 条**（新增 7 条），迁移 31 → 33 个。

---

## 2026-10-01 追加：4c 裁判端开始（4c-1 裁判工作台完成）

### ✅ 4c-1 裁判工作台 `/judge`（规范 §9.1）

**这一页原来也是一个会说假话的界面。** 未获批准的裁判被指派不了任何比赛，
于是他看到的是「目前没有指派给你的比赛 / 管理员指派之后，你会在这里看到要评分的比赛」——
而真实原因是**申请还没批**。他会一直等一个永远不会来的指派。

规范 §9.1 要求的正好相反："If unapproved, replace operational content with
application status and next steps."
因此未获批准时这一页**只显示申请状态与下一步**（三种：待审批 / 未通过 / 已暂停，
以及"还没有裁判档案"），**不显示任何待办数字** —— 那些数字只会是 0，而且是误导性的 0。

已获批准时按规范列的五项来：下一场 hero → 待办数字 → 待办列表 → 最近提交 → 全部指派。

判断全部在 `lib/domain/judge-home.ts`（18 条测试），页面只负责画。

**⚠️ 一处刻意的解释**：规范的分段叫 `Upcoming` / `Completed`，这里按
**「我的工作是否完成」**（评分表交没交）分，而不是按比赛时间分。
理由：裁判真正要回答的是"我还欠哪几份"。一场两周前、评分表一直没交的比赛
如果被归进 Completed，那份欠账就**永远看不见了**。这一条有测试固定。

**⚠️ 两处规范要求这一轮没有做，都不是 UI 能单独完成的：**

- **§9.2 的"冲突声明"**（Allow conflict declaration before confirmation;
  require a reason from configured choices plus optional note）：
  系统里**没有**这个功能。现有的 "conflict" 只是数据库里一条**时间撞车**的触发器
  （同一裁判不能被指派到时间冲突的两场）。要真做冲突声明，需要
   ① 一个存声明的地方（新表或新列）、② 一组**可配置的理由**（产品决定）、
   ③ 声明之后发生什么（撤销指派？通知管理员？）、④ 审计。
  这已经是一个新功能，不是 UI 改造。**需要产品负责人拍板。**
- **§9.3 的评分表改造**（自动保存 + 复核摘要 + 提交确认弹窗 + sticky 摘要）：
  现在"保存草稿"与"提交"是两个明确按钮，**没有**自动保存。
  规范还要求 "On reconnect, reconcile with server version and **never silently
  overwrite a newer ballot**" —— 那需要**版本比对**（ballet 表只有 `updated_at`），
  属于数据完整性改动，值得单独一轮认真做。

---

## 2026-10-01 追加：4c-2 裁判评分表（评分表提交的**致命缺陷**已修）

### 🔴 先说缺陷：5 个赛制里有 4 个**根本提交不了**评分表

原来评分表的**所有输入框都在 `<form>` 之外** ——
页面上只有两个各自装着隐藏字段的小 `<form>`，真正的分数、胜方、判决理由
全在它们外面。后果：

```js
formData.get("winnerTeamId")      // 永远是 null
formData.get("reasonForDecision") // 永远是 null
```

而官方模板里有 **4 个**（PF / JWSD / WSDC / 一对一）都是
`winnerRequired: true` **且** `reasonForDecisionRequired: true`，
服务端 `canSubmitBallot` 因此必然拒绝：
裁判选完胜方、写完理由，点提交仍然被告诉「还不能提交：请选择胜方；请填写判决理由」——
**无论怎样都提交不了**。只有 BP（没有胜方）能提交。

修法：整个填写区收进**一个** `<form>`；胜方改成**带 `name` 的 radio group**
（规范 §9.3 也要求 winner 用 radio）；判决理由改为受控并在表单内。
"保存草稿"通过 `formAction` 指向保存动作，因此**草稿永远可用**这一点没变
（保存动作不做内容校验）。

**✅ 产品负责人已确认（2026-10-01）：生产上没有任何 PF / JWSD / WSDC 的评分表被提交过。**
也就是说这条链路（**裁判交表 → 管理员发布 → 学生看到反馈**）
在 4 个赛制上**从来没有走通过一次** —— 学生端"我的评分表"一直是空的，
不是因为没有活动，而是因为裁判根本交不上表。这条缺陷现在已经修好。

### ✅ 4c-2a 同时完成的规范 §9.3 条目

| 规范要求 | 现状 |
|---|---|
| 1. Sticky round summary | ✅ 场次/房间/赛制/模板/时间/状态跟着滚 |
| 2. Decision/winner control（**radio group**） | ✅ 改成 radio |
| 3. Template-defined scoring sections | 已有（模板生成） |
| 4. Written feedback fields | 已有 |
| 5. Private admin note `Not shown to students` | ⚠️ **未做**：系统里没有"只给管理员看的裁判备注"这个策略，规范写的是 "only if policy supports it" |
| 6. Review summary | ✅ 提交前那一步确认会列出**还缺哪些必填项**（谁 · 哪一项） |
| 7. `Save draft` 与 `Submit ballot` | ✅ 仍在，且草稿不校验 |
| 提交确认弹窗 + "editing may be locked" 提醒 | ✅ 表单内一步确认（可读、可聚焦、无需 JS 弹窗） |
| 提交后显示**时间戳与编号**的不可变视图 | ⚠️ **未做**：只读视图有，但没显示提交时间与编号（要往 `BallotContext` 加 `submittedAt`） |
| **自动保存**（idle + blur，`Saved just now` / `Saving…` / 失败重试） | ⏳ **未做**，见下 |
| **"never silently overwrite a newer ballot"** | ⏳ **未做**，见下 |

### ⏳ 4c-2b（下一轮）：自动保存与版本比对

规范第一句就是 "The ballot is **autosaved** and resilient"，而且明确要求
"On reconnect, reconcile with server version and **never silently overwrite a
newer ballot**"。后者需要：

- `BallotContext` 带上 `updatedAt`（ballot 的 `updated_at`）；
- 保存动作接受 `expectedUpdatedAt`，不一致时返回一个**可识别**的状态
  （而不是普通错误），界面据此**停止自动保存**并告诉裁判"这份评分表在别处被改过"；
- 自动保存成功后要把新的 `updatedAt` 回写到界面状态。

也就是说它需要**乐观并发**，属于数据完整性改动 —— 单独一轮做。
另外顺手要做的：只读视图显示提交时间与编号。

---

## 2026-10-01 追加：4c-2b 自动保存 + 版本比对（完成）

### ✅ 做了什么（规范 §9.3 的第一句与最后两条）

| 规范要求 | 做法 |
|---|---|
| "autosaved after a **short idle period**" | 停止打字 2.5 秒后自动保存 |
| "and on **field blur**" | 表单上冒泡的 `onBlur`（不必给每个输入框挂一遍） |
| "Display `Saved just now`, `Saving…`, `Couldn't save—retrying`" | 三个说法都在；**冲突**是第四种，单独说清楚 |
| "without blocking typing" | 保存期间输入框**不禁用**（只有按钮禁用） |
| "reconcile with server version and **never silently overwrite** a newer ballot" | 乐观并发：见下 |
| 失败自动重试 | 最多 2 次、间隔 8 秒；再失败就给一个「重试保存」按钮（无限重试只会一直打服务器） |

### 乐观并发是怎么做的

1. `BallotContext` 多带一个 `updatedAt`（`ballots.updated_at`，还没有这一行时为 null）；
2. 每次保存都把「我读到的是哪个版本」一起发回去（`expectedUpdatedAt`）；
3. 服务端**写库之前**比对，不一致就返回 `conflict: true` 并且**不写**；
4. 界面收到冲突后：**停止自动保存**（`canAutosave("conflict") === false`），
   并给出两个选择 ——「载入最新版本（丢弃我这里的改动）」或「仍然保存我的内容」（明确覆盖）。

⚠️ 这里有一条**语义必须分清**：`expectedUpdatedAt` **为空字符串**表示
"我读的时候还没有这一行"（新建草稿），而**字段不存在**（配合 `overwrite=true`）
才是"裁判看过提示、明确选择覆盖"。混起来就会出现"过期的自动保存把别人的修改悄悄冲掉"。
`withExpectedVersion()` 与 `versionMatches()` 就在 `lib/domain/ballot-autosave.ts`
（17 条测试），组件里不再写这些判断。

⚠️ **提交（submit）刻意不做版本检查**：规范那句的关键词是 "silently"，
而提交是裁判在**看过确认摘要之后**的明确动作，不是静默写入。
如果将来要让提交也带版本，`expectedUpdatedAt` 已经在表单里了，加几行即可。

### 🐞 我自己的测试抓出了两个实现错误（记下来，因为它们很典型）

1. `versionMatches("", null)` 返回了 false —— 空字符串没有归一成 null，
   于是"新建草稿时的第一次自动保存"会被当成冲突，**裁判第一次打字就被拦**。
2. `withExpectedVersion()` 在非覆盖模式下没有清掉上一次留下的 `overwrite`，
   于是裁判点过一次"仍然保存我的内容"之后，**之后所有保存都不再检查版本**
   —— 乐观并发被永久关掉了，而且不会有任何报错。

两条都是先由测试失败暴露、再改实现（不是改测试）。

**反向验证**：把"冲突时不允许自动保存"改成允许、把 `overwrite` 的清理去掉、
把空字符串与 null 分开 → 三条测试分别 FAIL；还原后全绿。

### ⏳ 4c 还剩什么

- **只读视图显示提交时间与编号**（规范："immutable submitted view with timestamp and
  reference ID"）：还要给 `BallotContext` 加 `submittedAt` + 显示（很小）。
- **§9.2 冲突声明**（新功能，需要产品负责人定理由与处理流程）。
- 只给管理员看的裁判备注（`Not shown to students`）：系统里没有这个策略。

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

### ✅ 4b-3 学生活动详情 `/student/events/[eventId]`（规范 §8.3）—— 完成

按规范列的顺序分成六节：

```
hero 摘要（深蓝）→ 关于这场活动 → 时间安排 → 资格与赛制 → 我的报名 → 重要信息
```

- **hero 摘要**（新组件 `components/domain/event-detail-hero.tsx`，13 条测试）：
  标题、状态、日期/时间/时区、地点、赛制、报名截止，以及角色化 CTA。
- **时间安排**：五个时间点逐个列出，每个都写明时区。
- **资格与赛制**：逐个赛制显示你有没有资格（`你已具备资格` / `你暂无资格`）
  与你的偏好名次，下面接赛制偏好表单。
- **我的报名**：报名/取消/签到（窗口未开放时不显示按钮）+ 搭档。
- **重要信息**：迟取消的后果、签到规则、线上链接或"这是线下活动"。

**⚠️ 两处刻意的设计决定：**

1. **hero 的 CTA 是页面内锚点（`#my-registration`），不是链接**。
   在首页那个 hero 上"去报名"指向本页是合理的（点进去报名）；
   但在**本页**再指一次当前网址，点了什么都不会发生。
   因此这里跳到「我的报名」那一节；而当学生没有可做的事时
   （已签到、报名已截止且未报名）**完全不显示 CTA** ——
   一个点了没反应的按钮比没有按钮更糟。有测试固定住这一点。
2. **深蓝底上的配色**：状态用 `StatusBadge`（自带浅底深字，放在深蓝上仍清晰）；
   赛制用 `MetaChip` 并覆盖描边与文字色 —— 它默认的 `text-foreground` 是深色，
   直接放在深蓝上会看不见。

**⚠️ 规范里有两条这一轮没有做，都不是 UI 能单独完成的：**

- §8.3 的 `Rounds and results` 一节：学生端没有轮次与结果的页面或数据。
- §8.4 的「Save draft 与 Submit registration 分开」：报名表里没有"草稿"状态
  （数据库的报名状态只有 registered / cancelled / late_cancelled / checked_in /
  no_show）。加草稿态是数据模型改动。

**🔍 顺带发现一个安全/隐私问题（需要产品负责人决定）：**

活动的**会议链接现在对任何登录用户都可见** —— 不只是报名了的人。
原因是 RLS 是**行级**的（`events_select_authenticated` 允许所有登录用户读
events 的**所有列**），而 `meeting_url` 就在这张表上。
规范 §8.5 要求 "Hide join link until permitted"，但那需要**列级**权限或一个视图，
是数据库改动。
⚠️ 特别提醒：**光在界面上藏起来不算修好** —— 知道怎么调接口的人照样拿得到。
因此我没有改界面来"看起来修好了"。

### ✅ 4b-4 我的评分表 `/student/ballots`（规范 §8.7）—— 完成

**学生端（4b）到此做完。**

规范原文："Use readable document layout, **not a dense form after submission**.
Preserve line breaks. Print view must be clean and omit navigation."

这一页原来是"卡片堆"：一份评分表把个人分、两队总分、判决理由、交锋、论点、
队伍反馈六类东西平铺在一张卡上，全是 `label：value` 段落，
学生分不清哪段是分数、哪段是裁判写的话。

现在每一份评分表是一个**可读的文件**（新组件 `components/domain/ballot-document.tsx`，16 条测试）：
这一场是什么 → 结果 → 我的分数（表格）→ 两队总分 →
**裁判的反馈（做得好的地方 / 应该改进的地方，分成两节）** → 判决理由 → 交锋与论点。
所有长文字保留换行（规范明确要求）。

**顺带修掉一个信息遗漏**：模板里的「裁判信心」（1–3 档：清晰判决 / 势均力敌 /
非常接近）是 `scope: "match"` 的**分数**字段，而学生端原来只映射了
`speaker` 范围的分数与 `match` 范围的**文字** —— 于是一整类信息被静默丢掉。
现在会显示成「势均力敌（2）」，用的是模板里的原话（规范要求 "the exact ballot
template labels"，光给一个 2 学生看不懂）。

**🔍 顺带发现并修掉一个"看起来像系统坏了"的问题**：
数据库约束是 `ballots_match_judge_key unique (match_id, judge_id)` ——
**一场比赛可以有多位裁判的评分表**（PF 本来就是裁判团）。
原来页面把每一份平铺成一张几乎一样的卡：「第 3 场 · A101」出现三次、
分数却不同、**没有任何说明**。学生看到的第一反应是系统坏了。
现在按**比赛**分组，组内每份给一个匿名序号（`裁判 1`、`裁判 2`），
并说明"这一场有 N 位裁判的评分表，分数不同是正常的"。
分组与排序在 `lib/domain/student-ballots-view.ts`（7 条测试）。

⚠️ **顺序必须确定**：`localeCompare` 排同一个开始时间的两份没有稳定先后，
所以最后一定再用 `ballotId` 兜底 —— 否则同一个学生刷新两次会看到
"裁判 1 / 裁判 2"对调。这一条有测试固定。

**打印视图**（规范："Print view must be clean and omit navigation"）：
应用外壳的页头（含主导航、语言切换、退出）与页脚加了 `print:hidden`，
内容区打印时放开内边距与最大宽度；页面里把**动作类**的东西也标上
（复核表单、返回按钮）。分数与裁判写的字是**内容**，打印时必须保留 ——
有一条测试专门断言"这一页里不该有任何 print:hidden 的内容"。
外壳那三条在 `tests/unit/app-shell.test.tsx`。

**⚠️ 规范里这几条没有做（都不只是 UI）：**

- `/feedback` 与 `/feedback/:ballotId` 是规范里的**新路由**；现在用的是
  `/student/ballots`（阶段 5 的路由改名会一起处理）。拆出"索引页 + 详情页"
  属于结构改动，等路由改名那一步一起做更省事。
- **"Mark as reviewed"（标记已读）**：数据库里 ballot 没有"学生读过"这个状态。
  加它要新表/新列，是数据模型改动。
- **裁判姓名 vs 匿名**：规范 §8.7 说的是 "judge name or `Judge` according to
  anonymity policy"，而"要不要向学生公开裁判姓名"**没人拍过板**。
  现在**完全不显示**（原来的代码就没查裁判），序号是为了消除歧义而不是身份。
  这一条见下面「待产品负责人决定」。

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

3. ⚠️ **要不要向学生公开"本场裁判是谁"？**
   规范 §8.7 把这件事留给 "anonymity policy"，而它还没被定过。
   现在**完全不显示**（原来的代码就没有查裁判），多裁判时只有一个匿名序号
   （`裁判 1`、`裁判 2`）。三个选项：保持匿名 / 显示姓名 / 显示"裁判"这种角色词。
   我的建议：**保持匿名**，因为一旦公开，学生可以直接找裁判理论，
   而反馈本来是为了让他改进。

4. ⚠️ **会议链接要不要按"时机"隐藏？**（见 4b-3 那节的说明）
   现在任何登录用户都能看到线上活动的会议链接。真要挡，需要**列级权限或视图**
   （数据库改动）；只在界面藏起来是假的安全感。
   规范 §8.5 要求 "Hide join link until permitted" —— 但"permitted 是什么时机"
   规范没有写死，这是产品决定。

5. ⚠️ **§9.2 的"裁判冲突声明"要不要做？**
   这是一个**新功能**（见上面 4c-1 那节的说明）：需要决定
   ① 声明存在哪里、② **可配置的理由有哪些**（规范说 "a reason from configured
   choices"，也就是要在系统设置里配）、③ 声明之后发生什么（撤销指派？通知管理员？）。
   我建议的做法：先只做"提交冲突声明 → 通知管理员 → 由管理员撤销指派"，
   理由先用一组固定选项，不做成可配置的。

6. ⚠️ **§9.3 的评分表自动保存要不要做？**
   规范要求自动保存 + "never silently overwrite a newer ballot"。
   后者需要版本比对（现在只有 `updated_at`）。这是一次**数据完整性**改动，
   我建议单独一轮做，而不是顺手加个 `setTimeout`。

7. **阶段 4 剩下的部分按什么顺序做？**
   **学生端（4b）已做完；裁判端 4c-1（工作台）与 4c-2a（评分表结构 + 那个致命缺陷）已完成。**
   剩下的：`4c-3` 冲突声明（§9.2，**新功能**，需要你先定理由与处理流程）／
   `4a` 认证页／`4d` 俱乐部管理／`4e` 系统管理；裁判端还差两件小的
   （只读视图显示提交时间与编号、私密裁判备注——后者要先有策略）。


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
