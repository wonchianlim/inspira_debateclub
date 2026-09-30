# 上线清单（Vercel + Supabase Pro 新加坡）

> **给谁看的**：产品负责人。每一步都写成"点哪里、填什么"。
> **前提**：已批准 $45/月（Supabase Pro $25 + Vercel Pro $20）。
>
> ⚠️ **本文里的凭据一律不要贴进对话或提交进仓库。**
> 填进对应服务的控制台即可。

---

## 第 0 步：先决定"用哪个邮箱注册"

**三年后你还在用哪个邮箱？**

如果账号绑在一个你将来会弃用的邮箱上，**社团就失去了这套系统**。

建议用**社团自己的、长期可控的**地址（例如 `debateclub@inspira.education`）。

**每个账号都做这两件事：**

- [ ] 打开两步验证（2FA）
- [ ] 把**恢复码**存到安全的地方（不只是你手机上）

> "只有一个人能登录、而他联系不上了"是这类系统最常见的死法 —— **比技术故障常见得多**。

---

## 第 1 步：注册账号

- [ ] **GitHub** → 建一个**私有**空仓库（例如 `inspira`）
- [ ] **Supabase** → 注册，**先别建项目**
- [ ] **Vercel** → 注册（选「用 GitHub 登录」最省事）

**建好后告诉我仓库地址** —— 我给你推送命令。

---

## 第 2 步：把代码推到 GitHub

⚠️ **这一步你自己做** —— 我不该碰你的 GitHub 令牌。

我会给你两条可以直接复制的命令（`git remote add` + `git push`）。
**你粘贴到终端里运行就行。**

---

## 第 3 步：建 Supabase 生产项目

- [ ] Supabase 控制台 → **New project**
- [ ] **Region 选 `Southeast Asia (Singapore)`** ← 对应规范里的"新加坡"
- [ ] 数据库密码：**用密码管理器生成一个强密码并存好**（丢了要重置）
- [ ] 建好之后 → **Project Settings → Database** → 记下连接串

**Supabase Pro 要点：**

- [ ] 确认升级到 **Pro**（Free 会在**一周无人使用后暂停** —— 对社团是致命的）
- [ ] 确认 **Daily backups** 已开启（Pro 自带，保留 7 天）

---

## 第 4 步：把 29 个迁移跑到生产库

```bash
cd /Users/chianlim/Documents/deepseek-harness/default-workspace/inspira

# 1. 登录（会打开浏览器让你授权）
npx supabase login

# 2. 链接到生产项目（会问数据库密码 —— 就是第 3 步存好的那个）
npx supabase link --project-ref owkntjvfsrrjuithgdtq

# 3. 应用全部 29 个迁移
npx supabase db push
```

> ⚠️ 生产项目 ref：**`owkntjvfsrrjuithgdtq`**

- [ ] 迁移全部成功
- [ ] 到 Supabase 控制台的 **Table Editor** 确认表都建出来了（**35 张** —— 与本地 `db:verify` 重建后的数量一致）

> ⚠️ **这一步已经在本地演练过很多次**：`npm run db:verify` 每一轮都会
> 删库重建、从零重放全部迁移、再跑 251 条数据库用例。
> 所以生产上出问题的概率很低，**但不要跳过确认**。

---

## 第 5 步：种子数据

生产库是空的，需要：

- [ ] **5 种赛制**（PF / JWSD / WSDC / BP / ONE_V_ONE）—— 迁移里带
- [ ] **第一个超级管理员**（你自己）
- [ ] **5 份官方评分表模板** → 登录后到「管理区 → 评分表模板」点**「载入官方模板」**

> ⚠️ 顺序很重要：**先建好超级管理员，再载入模板** ——
> 模板的 `created_by` 是必填的，没有管理员就载入不了。

---

## 第 6 步：配 Supabase 的注册确认邮件

学生注册时的确认邮件由 **Supabase Auth** 发出。
**它自带的发信服务有严格频率限制，不能用于生产。**

- [ ] Supabase → **Authentication → Emails → SMTP Settings**
- [ ] 填入 Resend 的 SMTP（`smtp.resend.com`，端口 465，用户名 `resend`，密码 = Resend 的 API 密钥）
      ⚠️ **请以 Resend 后台 Settings → SMTP 页面显示的为准**
- [ ] 发一封测试信确认

**或者**：把「Confirm email」关掉（学生不需要点邮件就能用）。
**关掉之后邮件就只是"顺带告知"，进垃圾箱完全不影响功能** ——
忘记密码由管理员重置（Phase 2 已有这个功能）。

> 📌 **我推荐关掉。** 理由：这是辩论社，成员是你认识的人，
> 不需要用邮件证明"这个邮箱真实存在"。少一个环节，少一类故障。

---

## 第 7 步：建 Vercel 项目

- [ ] Vercel → **Add New → Project** → 选第 1 步那个仓库
- [ ] Framework 会自动识别为 Next.js
- [ ] **先别点 Deploy** —— 先填环境变量

### 环境变量（照 `.env.example` 填）

| 变量 | 从哪来 | 注意 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | 公开，会进浏览器 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上 | 公开，RLS 保证安全 |
| `SUPABASE_SERVICE_ROLE_KEY` | 同上 | ⚠️ **绝密**，只在服务端用 |
| `NEXT_PUBLIC_APP_URL` | 你部署后的网址 | 例如 `https://inspira.vercel.app` |
| `RATE_LIMIT_SALT` | `openssl rand -hex 32` 生成 | 至少 32 字符 |
| `RESEND_API_KEY` | Resend 后台 | ⚠️ **绝密** |
| `EMAIL_FROM` | `INSPIRA 辩论社 <noreply@mail.inspira.education>` | |
| `JOB_DISPATCH_SECRET` | 自己生成一串随机字符 | 保护定时任务接口 |

- [ ] 八项都填好 → 点 **Deploy**
- [ ] 部署完成后打开网址，确认能登录页

---

## 第 8 步：冒烟测试（上线前必做）

- [ ] 能打开登录页，**样式正常**（不是一堆裸 HTML）
- [ ] 用超级管理员登录 → 进得了管理区
- [ ] 「评分表模板」→ 载入官方模板 → **5 份都在**
- [ ] 建一个测试活动 → 报名 → 配对 → 生成比赛
- [ ] 用测试裁判账号填一份评分表 → 提交
- [ ] 管理员发布 → **用测试学生账号能看到分数**
- [ ] 触发一封邮件（或手动入队）→ **真的收到**

---

## 第 9 步：大陆测试矩阵（规范明确要求）

**需要你在两条实际网络上、不用 VPN 访问部署好的站点。**

测什么：

| 项目 | 记什么 |
|---|---|
| 首页能否打开 | 成功 / 失败 |
| 打开耗时 | 秒 |
| 登录能否完成 | 成功 / 失败 |
| 填一张评分表能否提交 | 成功 / 失败 |

结果写进 `docs/deployment-regions.md`。

⚠️ **Vercel 在中国大陆没有节点** —— 这一步**可能**发现偏慢或不稳。
若确实如此 → 换香港 VPS（$6–12/月），**代码不用改**（项目里已有 Dockerfile）。

---

## 第 10 步：回滚方案

**Vercel 侧**：控制台 → Deployments → 选上一个正常版本 → **Promote to Production**（秒级回滚）

**数据库侧**：迁移是**只增不改**的，回滚代码不会破坏数据。
若某个迁移本身有问题 → 从 **Supabase 的每日备份**恢复（会在恢复前先告诉你影响范围）。

**紧急止血**：把站点下线（Vercel → Settings → 暂停），避免继续写入坏数据。

---

## 上线后定期要做的事

| 频率 | 事项 |
|---|---|
| 每月 | 看一眼账单（预算 $45） |
| 每学期 | 确认备份存在（Supabase → Database → Backups） |
| 续费 | 域名约 $25/年；Supabase 与 Vercel 按月自动续 |
| 换人时 | **把账号所有权交接清楚** —— 否则社团会失去系统 |
