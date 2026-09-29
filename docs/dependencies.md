# 依赖版本提案（Phase 0 交付物）

**文档状态：** Phase 0 草案，等待产品负责人确认
**对应规范：** 第 5.1 节（推荐技术栈）、第 14.1 节（必需检查）
**版本核实日期：** 2026-09-29（来源：npm 官方 registry）
**读者：** 非技术产品负责人 + 后续实现者

> 本文只描述计划。**尚未安装任何依赖，尚未创建 `package.json`，尚未运行过构建。**
> 规范第 5.1 节要求"使用初始化时最新的、互相兼容的稳定版本"。本文给出的是**核实日的最稳定版本**，但"互相兼容"必须由 P1-1 实际运行检查来证明——本文第 4 节列出了必须验证的风险点。

---

## 1. 为什么需要这份文档

规范 Phase 0 要求"提出确切的包版本与源码结构"。源码结构在 `docs/architecture.md` 第 5 节；本文负责**版本**。

为什么版本要写死：规范第 5.1 节要求"把版本锁定在 lockfile 中"。如果使用 `^` 或 `~` 这类范围写法，不同时间、不同机器安装出来的版本会不同，可能出现"我这里是好的，你那里报错"这种情况——对一个由非技术负责人长期维护的项目来说，这是最不该出现的故障类型。

---

## 2. 建议的精确版本

> ⚠️ **本节已由实测结果取代，请以 [`docs/decisions/0010-dependency-version-fallbacks.md`](./decisions/0010-dependency-version-fallbacks.md) 为准。**
>
> P1-1 实际安装并运行检查后，发现两个新大版本与 lint 工具链不兼容，已按 `DEP-2` 的授权回退：
>
> | 包 | 本节原提案 | **实际采用** | 原因 |
> |---|---|---|---|
> | `typescript` | 7.0.2 | **6.0.3** | `typescript-eslint` 要求 `<6.1.0` |
> | `eslint` | 10.11.0 | **9.39.5** | `eslint-plugin-react` 要求 `<=9.7` |
> | `react` / `react-dom` | 19.3.0 | **19.2.8** | Next 16.3.7 的官方测试组合 |
> | `@types/node` | 26.6.3 | **24.19.0** | 类型主版本须跟随 Node 运行时（本机为 Node 24） |
>
> 下方表格保留为**原始提案**，仅用于说明决策过程。

以下版本来自 npm 官方 registry，核实日期 **2026-09-29**。写入 `package.json` 时**不带** `^` 或 `~`。

### 2.1 运行时依赖

| 包 | 建议版本 | 用途 |
|---|---|---|
| `next` | `16.3.7` | 应用框架（App Router） |
| `react` | `19.3.0` | 界面库 |
| `react-dom` | `19.3.0` | 界面库（浏览器渲染） |
| `@supabase/supabase-js` | `2.117.2` | 数据库与认证客户端 |
| `@supabase/ssr` | `0.12.7` | 服务端会话与 cookie 处理 |
| `zod` | `4.6.5` | 输入校验 |
| `server-only` | `0.0.1` | 防止服务端密钥模块被客户端引用（`docs/architecture.md` 7.3） |

**说明：** `node engine` 要求为 `>=20.9.0`（来自 `next` 的 `engines` 字段）。本机 Node 版本为 **24.19.0**，满足要求。

### 2.2 开发依赖

| 包 | 建议版本 | 用途 |
|---|---|---|
| `typescript` | `7.0.2` | 类型检查（⚠ 见 4.1） |
| `tailwindcss` | `4.3.3` | 样式（⚠ 见 4.2） |
| `eslint` | `10.11.0` | 代码检查（⚠ 见 4.3） |
| `eslint-config-next` | `16.3.7` | Next.js 官方 lint 规则（与 `next` 同版本号） |
| `prettier` | `3.9.9` | 格式化 |
| `prettier-plugin-tailwindcss` | `0.8.1` | 自动排序 Tailwind 类名 |
| `vitest` | `5.0.2` | 单元/集成测试 |
| `@vitejs/plugin-react` | `6.1.1` | Vitest 的 React 支持 |
| `@testing-library/react` | `16.3.3` | 组件行为测试 |
| `@testing-library/jest-dom` | `7.0.1` | 语义化断言 |
| `jsdom` | `30.1.1` | 测试用浏览器环境 |
| `@playwright/test` | `1.63.0` | 端到端测试 |
| `@types/node` | `26.6.3` | Node 类型 |
| `@types/react` | `19.3.0` | React 类型 |
| `@types/react-dom` | `19.3.0` | React DOM 类型 |

### 2.3 不作为依赖安装的工具

| 工具 | 用法 | 说明 |
|---|---|---|
| `shadcn`（CLI） | 用 `npx` 一次性运行 | 它把组件**源码复制进仓库**，不是运行时依赖。因此不写入 `package.json`。 |
| `supabase`（CLI） | 用 `npx` 运行，或在 CI 中固定版本 | 用于本地数据库与生成类型。建议在 CI 中固定版本以保证可复现。 |

---

## 3. 需要产品负责人知道的一句话总结

这些版本号看起来很多，但**你不需要记住它们**。它们的作用是：让这台电脑、以后的服务器、以及自动化检查环境安装到**完全相同**的版本，从而避免"换了台机器就跑不起来"。

你唯一需要知道的是：**如果安装过程中出现"版本不兼容"的报错，助手会停下来说明，而不会自己乱改。**

---

## 4. 必须在 P1-1 验证的兼容性风险

以下是本文核实到的**真实风险**。这些不是猜测，而是"最新稳定版里包含多个刚发布的大版本号"这一客观情况带来的。

### 4.1 ⚠ TypeScript 7.0.2 是一个全新的大版本

> ✅ **已由实测判定（2026-09-29）：确实不兼容，已回退到 TypeScript 6.0.3。**
> 实际报错：`typescript-eslint does not support TS 7.0.`（lint 退出码 2）。
> 注意 `typecheck` 在 TS 7.0.2 下**是通过的**，问题只在 lint 一侧。详见 [ADR-0010](./decisions/0010-dependency-version-fallbacks.md)。

`typescript` 的最新稳定版是 **7.x**，这是一个重大的架构换代。生态里的工具（ESLint 的 TypeScript 插件、Vitest、Next.js 的类型插件）不一定都已完全支持。

**应对：** 在 P1-1 实际运行 `typecheck`、`lint`、`test`、`build` 四条命令。
- 若全部通过 → 采用 `7.0.2`；
- 若任一工具不兼容 → 回退到所有工具都支持的最新版本，并在 `docs/decisions/` 新增一条 ADR 记录原因与所选版本。

**这条必须用实际运行结果决定，不能凭猜测。**

### 4.2 ⚠ Tailwind CSS 4.x 的配置方式与旧教程不同

Tailwind 4 改为以 CSS 为中心的配置方式。`shadcn/ui` 支持 v4，但**网上大量教程仍是 v3 的写法**。

**应对：** 只参考 shadcn/ui 与 Tailwind 官方当前文档；P1-2 完成后确认样式真的生效（而不是"看起来没报错但其实没加载"）。

### 4.3 ⚠ ESLint 10 是新大版本

> ✅ **已由实测判定（2026-09-29）：确实不兼容，已回退到 ESLint 9.39.5。**
> 实际报错：`TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function`。
> 根因：`eslint-plugin-react@7.37.5` 的 peer 为 `eslint ^3||…||^9.7`，不支持 ESLint 10。
>
> **附带发现：** 默认的 `eslint .` 在只有 warning 时**退出码仍是 0**，门禁形同虚设；已将 lint 脚本改为 `eslint . --max-warnings=0`，并用探针文件验证其确实会失败。详见 [ADR-0010](./decisions/0010-dependency-version-fallbacks.md)。

`eslint` 最新为 10.x，需要确认 `eslint-config-next@16.3.7` 确实支持它。

**应对：** P1-1 中实际运行 `npm run lint`，并确认它真的在检查文件（可以先故意写一个错误，确认 lint 能报出来）。

### 4.4 已确认满足的约束

| 约束 | 来源 | 状态 |
|---|---|---|
| Node `>=20.9.0` | `next` 的 `engines` | ✅ 本机 24.19.0 |
| React `^19.0.0` | `next` 的 `peerDependencies` | ✅ 采用 19.3.0 |
| `eslint-config-next` 与 `next` 同版本号 | 两者均为 `16.3.7` | ✅ 一致 |

### 4.5 ⚠ 环境阻塞：npm 无法写入默认缓存目录（**必须在 P1-1 之前解决**）

**问题（已复现）：** 在本机运行任何 `npm` 命令都会失败：

```text
npm error code EPERM
npm error path /Users/chianlim/.npm/_cacache/tmp/***
```

**已核实的原因：** 不是文件权限问题，而是**当前的文件沙箱限制**。npm 默认把缓存写在用户主目录下的 `~/.npm`，而该目录在项目工作区之外，被沙箱禁止写入（实测 `touch ~/.npm/_cacache/...` 返回 `Operation not permitted`，且该目录下**没有** root 拥有的文件）。

**已核实可行的解决办法（二选一）：**

| 方案 | 做法 | 特点 |
|---|---|---|
| **A（推荐）** | 在项目里放一个 `.npmrc`，把缓存目录指向项目内，例如 `cache=.npm-cache`，并把 `.npm-cache/` 加入 `.gitignore` | 完全在工作区内，不需要额外权限；**已实测可行** |
| B | 让助手在执行安装时使用更宽的沙箱权限（每次都需要你批准） | 会在每次安装时打断你 |

**这条会影响 P1-1 的第一步**，因此已同时记录在 `docs/phase-1-plan.md` 的前置条件里。

> 附带发现：npm 自身版本为 12.x，官方提示可升级到 12.1.0。这不影响本项目，暂不处理。

---

## 5. 安装与锁定规则

1. `package.json` 中的版本号**不带** `^`/`~`；
2. 提交 `package-lock.json`，它是版本的唯一依据；
3. 本地与 CI 统一使用 `npm ci`（而不是 `npm install`）以获得一致结果；
4. 依赖升级必须**单独提交**，并重新运行全部检查与大陆连通性测试（规范第 14.5 节要求：托管、DNS、CDN、认证、邮件或主要前端依赖变更后都要重跑）；
5. 新增任何运行时依赖前，必须先做大陆可访问性检查并取得产品负责人同意（规范第 5.1 节）。

---

## 6. 需要产品负责人确认的事项

> ✅ **本节已于 2026-09-29 确认（DEP-1 至 DEP-3 全部同意）。** 权威记录见 [`docs/decisions/0009-owner-confirmed-defaults.md`](./decisions/0009-owner-confirmed-defaults.md)。

| 编号 | 事项 | 建议 |
|---|---|---|
| DEP-1 | 同意本版本提案 | 同意 |
| DEP-2 | 若 TypeScript 7 与生态不兼容，是否同意回退到较旧的兼容版本 | 同意回退，并记录 ADR |
| DEP-3 | 采用 `.npmrc` 把 npm 缓存放进项目目录（4.5 方案 A） | 同意 |

---

## 7. 参考来源

| 来源 | 用途 | 访问日期 |
|---|---|---|
| https://registry.npmjs.org/（各包的 `latest` 标签与 `next/latest` 清单） | 全部版本号、`engines`、`peerDependencies` | 2026-09-29 |

**声明：** 版本号会随时间变化。本文的版本应在 P1-1 开始时**重新核实一次**，因为规范要求使用"初始化时"最新的稳定版本。
