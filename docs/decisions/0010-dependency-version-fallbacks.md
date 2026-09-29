# ADR-0010：依赖版本回退（TypeScript 6.0.3、ESLint 9.39.5）与四项基础约定

- 状态：已接受
- 日期：2026-09-29
- 相关：`docs/dependencies.md`、ADR-0008、`docs/phase-1-plan.md` P1-1；依据 `docs/decisions/0009` 中 DEP-2 的授权

## 背景

`docs/dependencies.md` 第 2 节按"最新稳定版"提出了版本清单，其中包含几个刚发布的大版本。同文档第 4.1 与 4.3 节把 TypeScript 7 与 ESLint 10 标为**必须用实际运行结果判定**的风险，并在 `docs/decisions/0009` 中取得授权（DEP-2）：**若不兼容则回退并记录一条 ADR**。

P1-1 实际安装并按序运行检查后，风险变为事实。以下是**实际观察到的错误**，不是推测。

### 观察 1：TypeScript 7.0.2 与 lint 工具链不兼容

```
$ npm run lint
typescript-eslint does not support TS 7.0.
```

根因（读取已安装包的 peerDependencies 得到）：

| 包 | 版本 | 对 typescript 的要求 |
|---|---|---|
| `typescript-eslint`（由 `eslint-config-next@16.3.7` 引入） | 8.71.0 | `>=4.8.4 <6.1.0` |

注意：**`npm run typecheck`（`tsc --noEmit`）在 TypeScript 7.0.2 下是通过的**。不兼容只发生在 lint 一侧，因为 typescript-eslint 需要读取 TypeScript 的编译 API，而 TS 7 更换了实现。

### 观察 2：ESLint 10.11.0 与 react 插件不兼容

改用 TypeScript 6.0.3 后，lint 换成另一个错误：

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
```

根因：

| 包 | 版本 | 对 eslint 的要求 |
|---|---|---|
| `eslint-plugin-react`（由 `eslint-config-next@16.3.7` 引入） | 7.37.5 | `^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8 \|\| ^9.7` |
| `typescript-eslint` | 8.71.0 | `^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` |

`typescript-eslint` 允许 ESLint 10，但 `eslint-plugin-react` 最高只到 9。**约束由更严的一方决定**，因此 ESLint 必须降到 9.x。

## 决定

### 1. 回退两个版本

| 包 | `docs/dependencies.md` 原提案 | **实际采用** | 原因 |
|---|---|---|---|
| `typescript` | 7.0.2 | **6.0.3** | typescript-eslint 要求 `<6.1.0` |
| `eslint` | 10.11.0 | **9.39.5** | eslint-plugin-react 要求 `<=9.7` |

### 2. 另外两项基于证据的调整

| 包 | 原提案 | **实际采用** | 原因 |
|---|---|---|---|
| `react` / `react-dom` | 19.3.0 | **19.2.8** | `create-next-app@16.3.7` 为 Next 16.3.7 精确锁定 19.2.8，是该版本测试过的组合。React 与 Next 的 Server Components 实现耦合很紧，规范要求"互相兼容"而非"各自最新"。 |
| `@types/node` | 26.6.3 | **24.19.0** | 类型包的主版本号跟随 Node 主版本。运行时是 Node 24，用 26 的类型会声明出运行时不存在的 API。 |

### 3. lint 门禁收紧为 `--max-warnings=0`

实测发现：默认配置下 `eslint` 遇到 **warning 时退出码仍是 0**。用一个故意引入未使用变量的探针文件验证：

```text
✖ 1 problem (0 errors, 1 warning)      ← 退出码 0
```

这样的"通过"没有门禁价值（规范第 16 章要求 lint 必须能作为阶段完成的条件）。改为 `eslint . --max-warnings=0` 后，同一探针变为退出码 1：

```text
ESLint found too many warnings (maximum: 0).   ← 退出码 1
```

### 4. 生产页面不使用 `next/font/google`

`create-next-app` 默认生成 `next/font/google`（Geist 字体）。已移除，改用系统字体栈。

依据规范第 5.4 节：生产浏览器体验不得依赖未经大陆测试的境外域名，且明确要求"自托管字体，并在自托管品牌字体通过审核前使用系统字体"。已实测确认构建产物中**没有**任何 Google 字体引用，且服务端 HTML 中**不含任何外部域名**。

### 5. 最终锁定版本（P1-1 实测通过）

运行时：`next@16.3.7`、`react@19.2.8`、`react-dom@19.2.8`、`@supabase/ssr@0.12.7`、`@supabase/supabase-js@2.117.2`、`zod@4.6.5`、`server-only@0.0.1`

开发：`typescript@6.0.3`、`eslint@9.39.5`、`eslint-config-next@16.3.7`、`tailwindcss@4.3.3`、`@tailwindcss/postcss@4.3.3`、`prettier@3.9.9`、`prettier-plugin-tailwindcss@0.8.1`、`vitest@5.0.2`、`@vitejs/plugin-react@6.1.1`、`@testing-library/react@16.3.3`、`@testing-library/jest-dom@7.0.1`、`jsdom@30.1.1`、`@playwright/test@1.63.0`、`@types/node@24.19.0`、`@types/react@19.3.0`、`@types/react-dom@19.3.0`

## 影响

**变简单：**
- 所有检查真实通过（见下方证据），而不是"最新版应该可以"；
- lint 成为真门禁，警告也会让 CI 失败；
- 生产页面无任何境外字体依赖，直接满足大陆访问的验收要求；
- `@types/node` 与运行时一致，不会误用不存在的 Node API。

**变复杂：**
- 采用了**不是最新**的 TypeScript 与 ESLint。将来 `typescript-eslint` 支持 TS 7、`eslint-plugin-react` 支持 ESLint 10 之后，可以升级；升级时需重跑全部检查。
- `docs/dependencies.md` 第 2 节的原始提案已被本文取代，该文档需同步更新。

## 备选方案

1. **保留 TypeScript 7，隐藏 lint。** 会让规范第 16 章要求的 lint 门禁失效，等于放弃一项质量保证。否决。
2. **保留 ESLint 10 并禁用 `eslint-plugin-react` 的规则。** 会失去 React 相关检查（含 hooks 规则的一部分），且属于"为了用新版本而降低检查强度"。否决。
3. **同时装 TypeScript 6 与 7 并存。** TypeScript 7 的发布说明确实提供了让工具使用 TS 6 API 的并存方式，但对一个由非技术负责人长期维护的项目来说过于复杂。若将来确需 TS 7 的新能力，再单独评估。

## 证据（实际运行的命令与结果）

| 检查 | 命令 | 退出码 |
|---|---|---|
| 格式 | `npm run format:check` | 0 ✅ |
| 代码检查 | `npm run lint` | 0 ✅（回退前为 2 ❌） |
| 类型检查 | `npm run typecheck` | 0 ✅ |
| 单元测试 | `npm test` | 0 ✅（28 个测试通过） |
| 生产构建 | `npm run build` | 0 ✅（Next.js 16.3.7，4 个静态页面） |

lint 门禁验证：故意引入未使用变量的探针文件 → `--max-warnings=0` 下退出码 1；移除后恢复 0。

## 待确认

- 无。本 ADR 属 DEP-2 已授权的回退，已在 `docs/decisions/0009` 中取得产品负责人同意。
- 未来升级 TypeScript 或 ESLint 时，需要重新验证并新增 ADR。
