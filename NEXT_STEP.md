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

**检查是否有未推送的提交：**

```bash
git log origin/main..HEAD --oneline
```

有的话让产品负责人用 **GitHub Desktop** 点 `Push origin`
（我没有仓库凭据，推送会失败 —— 这是正常的，不要反复重试）。

⚠️ **推送会触发 Vercel 自动部署，线上界面会变。**
阶段 3b 改的是**状态徽章的颜色**（见下），推之前请先读「颜色会怎么变」那一节，
以便向产品负责人说清楚会看到什么。

---

## 当前正在进行的工作：UI/UX 改造

规范：`/Users/chianlim/Documents/Codex/2026-10-01/referenced-chatgpt-conversation-this-is-an/outputs/inspira-debate-club-ui-ux-spec.md`
计划：`docs/ui-ux-improvement-plan.md`

| 阶段 | 状态 |
|---|---|
| 1 设计令牌底座 | ✅ 完成（含对比度自动化测试） |
| 2 应用外壳 / 角色感知导航 | ✅ 完成 |
| 3 状态体系 `StatusBadge` | ✅ 完成（含对比度自动化测试） |
| **3b 迁移 52 处旧 `<Badge>`** | ✅ **本次完成 —— 全项目页面里已 0 处 `<Badge>`** |
| 4 页面级改造 | ⏳ **这是下一步** |
| 5 路由改名（`/dashboard`→`/home` 等） | ⏳ **最后做，必须保留旧路径跳转** |
| 6 i18n 第 2–4 批 | ⏳ **推迟到阶段 4 之后**（否则文案搬两遍） |

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

---

## 待产品负责人决定

1. **`OWNER_GUIDE.md` 已过期**（写的是"还没有可运行的系统"，实际早已上线）。
   要不要我重写一遍？（建议：要，但等阶段 4 做完一起写，免得写两遍。）
2. **阶段 4 从哪一批开始？** 计划里的 4a–4e：
   `4a 认证页 / 4b 学生端 / 4c 裁判端 / 4d 俱乐部管理 / 4e 系统管理`。
   建议先做 **4b 学生端**（学生人数最多、看到的东西最一致）。

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
