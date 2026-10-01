# 交接文档（新会话从这里开始）

> 最后更新：2026-10-01。**本节之上是历史记录，可以只看这一节。**

---

## 一分钟了解现状

**INSPIRA 辩论社管理系统已经上线并在真实使用。**

```
生产网址   https://app.inspira.education
数据库     Supabase Pro（新加坡），35 张表，29 个迁移
网站       Vercel Pro（绑定自定义域名 —— vercel.app 在大陆被 DNS 污染）
邮件       Resend，发件人 noreply@mail.inspira.education（QQ 邮箱实测收到）
代码       GitHub 私有仓库 wonchianlim/inspira_debateclub
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

---

## 当前正在进行的工作：UI/UX 改造

规范：`/Users/chianlim/Documents/Codex/2026-10-01/referenced-chatgpt-conversation-this-is-an/outputs/inspira-debate-club-ui-ux-spec.md`
计划：`docs/ui-ux-improvement-plan.md`

| 阶段 | 状态 |
|---|---|
| 1 设计令牌底座 | ✅ 完成（含对比度自动化测试） |
| 2 应用外壳 / 角色感知导航 | ✅ 完成 |
| 3 状态体系 `StatusBadge` | ✅ **组件已完成并有测试** |
| **3b 迁移 52 处旧 `<Badge>`** | ❌ **未做 —— 这是下一步** |
| 4 页面级改造 | ⏳ |
| 5 路由改名（`/dashboard`→`/home` 等） | ⏳ **最后做，必须保留旧路径跳转** |
| 6 i18n 第 2–4 批 | ⏳ **推迟到阶段 4 之后**（否则文案搬两遍） |

### ⚠️ 阶段 3b 必须注意（我在这里失败过一次）

**我用脚本横扫 15 个文件去替换 `variant={...}`，产生 88 个类型错误，已全部回退。**

原因：脚本只换了属性，**没换标签名** `<Badge>` → `<StatusBadge>`，
于是生成了 `as StatusBadgeProps["tone"]` 这种错位代码。

**正确做法：**

```
✅ 逐文件手工改，一次 3–5 个文件，每批跑一次 npm run typecheck
❌ 不要写脚本横扫
```

**这不是机械替换，每处都要判断语义：**

| 界面文案 | 语气 |
|---|---|
| 胜 / 负 | `success` / `neutral` |
| 报名开放 / 关闭 | `success` / `neutral` |
| 已发布 / 草稿 | `success` / `neutral` |
| 账号启用 / 停用 | `success` / `danger` |
| 待审核 | **`warning`** ← 和"已发布"不同，不能套用 |
| 超时未开始 | `danger` |
| 邮件 已发送/失败/待发 | `success` / `danger` / `neutral` |

**另外两类要分开**：
- **25 处 `variant="outline" font-normal`** 是**元数据标签**（赛制代码、队伍名），
  **本来就已经一致**，不是状态 —— 可改成中性 `MetaChip`，但优先级低
- **18 处 `variant={条件}`** 才是真状态，**优先迁移这些**

建议先改这 5 个（学生直接看到）：`student/ballots`、`student/events`、
`events`、`admin/users`、`admin/judges`。

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
