# Phase 10 计划：发布准备

> 主规格第 15 节 Phase 10 原文：
> - Full end-to-end regression suite.
> - Clean-database migration rehearsal and seed procedure.
> - Selected **Hong Kong/Singapore** provider deployment documentation,
>   **data-location inventory**, **cost estimate**, **renewal instructions**,
>   and owner-friendly **operations guide**.
> - Full **mainland-China test matrix on at least two practical networks, with no VPN**,
>   with results stored in `docs/deployment-regions.md`.
> - Verification of email delivery to selected Chinese mailbox providers.
> - **Backup/restore and incident runbooks.**
> - Production **smoke test plan, launch checklist, rollback plan.**
> - **Known limitations and V2 backlog.**

---

## 已确认的决定（产品负责人 2026-09-30）

| 项 | 决定 |
|---|---|
| **月度预算上限** | **$45/月**（Supabase Pro $25 + Vercel Pro $20） |
| 邮件服务商 | **Resend**（不用中国产品） |
| 发信域名 | `mail.inspira.education`（子域名 —— 主域名已有腾讯企业邮箱 SPF） |
| DNS 托管 | **A2 Hosting 的 cPanel**（不是 GoDaddy；NS 指向 `a2hosting.com`） |
| 数据库 | Supabase **新加坡区**（对应规范里的"香港/新加坡"要求） |
| 网站托管 | Vercel Pro |

### ⚠️ 这条路的已知代价（已告知产品负责人）

**Vercel 在中国大陆没有节点。** 大陆访问的延迟与稳定性**不确定**，
因此规范要求的"两条实际网络、无 VPN"测试**可能会发现访问偏慢或不稳**。

**补救办法**（若测试确实不理想）：把 Next.js 换到新加坡 VPS（约 $6–12/月）。
**代码不用改** —— 这是本项目一直坚持的"托管与业务分离"。

---

## 已经**做完**的 Phase 10 项目

### ✅ 邮件向中国邮箱送达验证

`1013182970@qq.com` **收到了**来自 `noreply@mail.inspira.education` 的真实邮件。
**这是真做的验证，不是推断。** 见 `docs/phase-9-plan.md` 的 P9-7。

### ✅ 干净库迁移重放（migration rehearsal）

**已经在每一轮自动做**：`npm run db:verify` = `supabase db reset && npm run db:test`，
即**删库重建、从零重放全部迁移、再跑 251 条数据库用例**。

因此规范要求的"clean-database migration rehearsal"**不是待办事项，而是既有保障**。
需要补的是**种子数据流程**（seed procedure）—— 见下方 P10-3。

---

## 待做

### P10-1 端到端回归套件复查

现有：922 条单元 + 26 条集成 + 251 条数据库用例。
需要复查的是**回归覆盖面**：主流程（报名 → 配对 → 比赛 → 签到 → 填表 → 发布 → 学生查看）
有没有一条**连贯的端到端脚本**。目前是分段覆盖（各环节都有集成测试，但没有串起来的一条）。

### P10-2 部署文档 + 数据存放清单 + 费用估算 + 续费说明

- `docs/deployment-regions.md`：区域选择、数据存放位置（Supabase 新加坡 / Vercel 边缘）
- 费用估算与续费日期
- **数据存放清单**：哪些数据存在哪、谁能访问、保留多久

### P10-3 种子数据流程

生产库建好之后需要：赛制（5 种）、官方评分表模板（5 份）、第一个超级管理员。
目前官方模板靠界面按钮载入；**生产初始化需要一份可复现的流程文档**。

### P10-4 大陆测试矩阵

**需要产品负责人配合**（在两条实际网络上、无 VPN 访问部署好的站点）。
我会准备好记录表格与测试步骤，结果写进 `docs/deployment-regions.md`。

### P10-5 备份/恢复与事故处置手册

- Supabase Pro 自带每天备份（保留 7 天）—— 恢复步骤要写清楚
- 事故处置：数据库不可用、邮件发送失败、登录故障、误操作改数据

### P10-6 上线清单 + 冒烟测试 + 回滚方案

### P10-7 已知限制与 V2 待办

---

## 需要产品负责人做的（我不能代做）

| 事项 | 为什么需要你 |
|---|---|
| 建 Supabase 生产项目（新加坡区） | 需要你的账号与付款 |
| 建 Vercel 项目并连仓库 | 同上 |
| 在 Vercel 配环境变量 | 需要把 Supabase 生产密钥填进去 |
| **大陆测试**（两条网络、无 VPN） | 你或当地的人才能做 |
| 域名解析指向生产（可选） | 若要用 `inspira.education` 直接访问 |

**我会把每一步写成可以照做的清单**，包括"填哪一格、粘什么值"。
