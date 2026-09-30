# 生产部署记录（Phase 10）

> 2026-09-30 / 10-01 实际完成。**以下每一条都是执行过的，不是计划。**

## 生产环境现状

| 组件 | 实际配置 |
|---|---|
| 数据库 | **Supabase Pro，新加坡区**，项目 ref `owkntjvfsrrjuithgdtq` |
| 表数量 | **35 张**（29 个迁移全部应用） |
| 网站 | **Vercel Pro** |
| 正式网址 | **https://app.inspira.education** |
| 发信 | **Resend**，发件人 `noreply@mail.inspira.education` |
| 邮件 DNS | A2 Hosting cPanel（**不是 GoDaddy** —— NS 指向 `a2hosting.com`） |
| 代码 | GitHub 私有仓库 `wonchianlim/inspira_debateclub` |
| 超级管理员 | `wonchianlim@outlook.com` |
| 每月成本 | **$45**（Supabase $25 + Vercel $20；Resend 免费档） |

## ✅ 规范 Phase 10 各项的完成情况

| 规范要求 | 状态 | 证据 |
|---|---|---|
| Full end-to-end regression suite | ✅ | 41 个测试文件 / 922 条 + 26 条集成 + **251 条数据库用例** |
| Clean-database migration rehearsal | ✅ | `npm run db:verify` = 删库重建 + 重放 29 个迁移 + 251 条用例 |
| Seed procedure | ✅ | 见 `docs/deployment-checklist.md` 第 3–5 步；**超管必须先于模板** |
| Provider deployment documentation | ✅ | `docs/deployment-checklist.md` |
| Data-location inventory | ✅ | 见下方"数据存放" |
| Cost estimate | ✅ | **$45/月**（约 ¥330）；域名续费约 $25/年 |
| Renewal instructions | ✅ | 见下方"续费与交接" |
| Owner-friendly operations guide | ✅ | `OWNER_GUIDE.md` |
| **Mainland test matrix, no VPN** | 🟡 **第一条网络已完成** | `docs/deployment-regions.md` |
| **Email to Chinese mailbox providers** | ✅ | `1013182970@qq.com` **实测收到** |
| Backup/restore and incident runbooks | ⏳ **待写** | |
| Smoke test / launch checklist / rollback | ✅ | `docs/deployment-checklist.md` 第 8、10 步 |
| Known limitations and V2 backlog | ⏳ **待写** | |

## 数据存放

| 数据 | 存在哪 | 谁能访问 |
|---|---|---|
| 全部业务数据（学生、活动、比赛、评分表、分数） | **Supabase，新加坡** | 通过 RLS 按角色限制 |
| 备份 | Supabase 自动，**每天一次、保留 7 天** | 项目管理员 |
| 代码 | GitHub 私有仓库 | 你 |
| 邮件发送记录 | Supabase `email_outbox` | 管理员 |
| 邮件内容 | **Resend**（服务商处有发送日志） | 你 + Resend |
| 网站运行日志 | **Vercel** | 你 |

⚠️ **没有任何数据存在中国大陆。** 这是选新加坡区的结果，也是规范"香港/新加坡"要求所指向的。

## 续费与交接

| 项目 | 周期 | 金额 |
|---|---|---|
| Supabase Pro | 每月自动续 | $25 |
| Vercel Pro | 每月自动续 | $20 |
| 域名 `inspira.education` | **每年** | 约 $25 |
| Resend | 免费用量内 | $0 |

⚠️ **交接提醒**：这套系统的所有权分散在 **4 个账号**里
（GitHub / Supabase / Vercel / Resend）+ **2 个域名控制台**（GoDaddy 注册、A2 Hosting 的 DNS）。
**如果只有一个人能登录、而他联系不上了，社团就失去了这套系统。**

**建议**：把账号恢复方式写下来、存在社团能拿到的地方（不是只在你手机上）。

## 上线过程中实际踩到的坑（都记下来，避免重犯）

1. **`*.vercel.app` 在大陆被 DNS 污染** —— 完全连不上，不是"慢"。改用自定义域名解决。
   见 `docs/deployment-regions.md`。
2. **`NEXT_PUBLIC_SUPABASE_URL` 多了 `/rest/v1`** —— Supabase 返回
   `Invalid path specified in request URL`，而**界面显示的是
   "邮箱或密码不正确"**（那句话是刻意模糊的）。
   **只有 Vercel 日志能定位。**
3. **`NEXT_PUBLIC_*` 改了环境变量必须重新部署** —— 它们是构建时写进代码的。
4. **根页面与页脚挂着"Phase 1 / 尚未实现"** —— 上线当天才被发现，
   **因为没有任何测试会渲染它们**。
