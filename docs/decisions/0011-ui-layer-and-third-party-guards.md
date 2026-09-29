# ADR-0011：UI 层选型（shadcn/ui）与境外资源的自动化防护

- 状态：已接受
- 日期：2026-09-29
- 相关：`docs/phase-1-plan.md` P1-2、ADR-0010、规范第 5.1、5.4、13 节

## 背景

规范第 5.1 节要求界面使用 Tailwind CSS 与 shadcn/ui；第 5.4 节要求生产页面**不得**依赖未经大陆测试的境外资源，并明确要求"自托管字体，在自托管品牌字体通过审核前使用系统字体"。第 13 节要求每个主要页面都设计好加载/空/错误/无权限/成功五种状态，且不得只靠颜色表达状态。

P1-2 实际执行 `shadcn init` 的过程中，工具做了三件与本项目规则冲突的事，必须记录并处理。

## 决定

### 1. 采用 shadcn/ui，基座选择 radix

命令：`npx shadcn@4.21.0 init -y --no-monorepo --base radix -p nova`

`components.json` 的 `style` 为 `radix-nova`。选择 **radix** 而非 `base`/`aria`，因为 Radix 的无障碍基元（焦点管理、键盘交互、ARIA 属性）最成熟，直接服务于第 13 节的 WCAG 2.2 AA 目标。

### 2. 移除 `next/font/google`（shadcn 默认注入）

`shadcn init` 的 `Updating fonts` 步骤向 `app/layout.tsx` 注入了 Geist：

```tsx
import { Geist } from "next/font/google";
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
```

这与第 5.4 节直接冲突（要求系统字体）。已移除，改用 `app/globals.css` 的 `@theme inline` 中的系统字体栈。

### 3. 修正字体变量的循环引用

`globals.css` 中出现了自引用：

```css
@theme inline {
  --font-sans: var(--font-sans);   /* 自己引用自己 */
  --font-mono: var(--font-mono);
}
```

这是 P1-1 遗留的问题（当时我把字体栈写在 `:root`，又在 `@theme inline` 里引用同名变量），`shadcn init` 原样保留了下来。循环引用会让字体栈解析结果不确定。现已把**系统字体栈直接写在 `@theme inline` 中作为唯一来源**，并删除 `:root` 中的重复声明。

### 4. `shadcn` 保留为运行时依赖，而不是 devDependency

`globals.css` 中有一行 `@import "shadcn/tailwind.css"`，它由构建时的 CSS 处理器解析。若把 `shadcn` 移到 `devDependencies`，任何 `npm ci --omit=dev` 后再构建的流程都会失败（Docker 生产镜像很容易踩到）。因此保留在 `dependencies`，并在此说明原因。

### 5. `cn` 包替代 clsx + tailwind-merge

shadcn v4 生成 `lib/utils.ts` 为 `export { cn } from "cn"`。`cn@0.4.0` 是官方的 "drop-in replacement for clsx + tailwind-merge"，因此不再额外引入 clsx 与 tailwind-merge。

### 6. 所有新增依赖仍写死精确版本

`shadcn init` 写入的是 `^` 范围（违反 `docs/dependencies.md` 第 5 节）。已全部改为精确版本：

`class-variance-authority@0.7.1`、`cn@0.4.0`、`lucide-react@1.48.0`、`radix-ui@1.6.7`、`shadcn@4.21.0`、`tw-animate-css@1.4.0`

### 7. 用两层自动化检查守住第 5.4 节

不靠"记得不要用"，而是让违反会**自动失败**：

| 层 | 位置 | 检查内容 |
|---|---|---|
| 单元测试 | `tests/unit/no-third-party-assets.test.ts` | 扫描 `app/`、`components/`、`lib/` 源码，禁止 `next/font/google`、Google Fonts/Analytics/reCAPTCHA、jsDelivr、unpkg、cdnjs。匹配前先剥离注释，避免"解释为什么不用它"的文字被误判。 |
| 构建后检查 | `scripts/check-no-third-party.mjs`（`npm run check:no-third-party`） | 扫描构建产物：① 任何 `.js/.css/.html/.json` 不得出现禁用域名；② SSR 产出的 HTML 不得含任何会被浏览器请求的外部地址。 |

**该检查已用两个真实违规验证过它确实会失败**（见下方"证据"）。

### 8. 五种页面状态的统一实现

`components/domain/state-panel.tsx` 提供 `loading / empty / error / unauthorized / success`，并强制两条约定：

- 每个状态**同时**有图标与文字，绝不只靠颜色（第 13 节）；
- 错误与无权限用 `role="alert"`（立即播报），其余用 `role="status"`（礼貌播报）。

配套的路由级文件：`app/loading.tsx`、`app/error.tsx`、`app/not-found.tsx`。

## 影响

**变简单：**
- 后续所有页面直接复用 `AppShell` 与 `StatePanel`，状态与可访问性行为一致；
- 境外资源违规会同时被单元测试与构建后检查拦下，且经验证确实有效；
- 字体栈只有一个修改点（`@theme inline` 的 `--font-sans`）。

**变复杂：**
- `shadcn` 作为运行时依赖略显反直觉，已在第 4 点说明原因；
- 构建后检查引入了"必须先 build 再 check"的顺序依赖，因此提供了 `npm run check` 聚合命令保证顺序正确；
- 无头浏览器尚未安装，因此**响应式视觉验证（375px / 1440px）尚未完成**，见"待确认"。

## 备选方案

1. **保留 Geist 字体。** 违反第 5.4 节的明文要求，且构建期需要访问 Google（本项目网络已多次超时）。否决。
2. **`shadcn init` 后手工同步主题变量。** 即不用 CLI、自己复刻 Tailwind v4 主题块。工作量大且容易与上游不一致。未采用，改为"用 CLI + 事后修正"。
3. **把 `shadcn` 放 devDependencies。** 会让 `npm ci --omit=dev` 后的构建失败。否决。

## 证据（实际运行结果）

| 检查 | 退出码 |
|---|---|
| `format:check` | 0 ✅ |
| `lint`（`--max-warnings=0`） | 0 ✅ |
| `typecheck` | 0 ✅ |
| `test` | 0 ✅（4 个测试文件、**61 个测试通过**） |
| `build` | 0 ✅（静态路由 `/` 与 `/_not-found`） |
| `check:no-third-party` | 0 ✅ |

违规探针验证（证明检查有效，非空转）：

| 探针 | 结果 |
|---|---|
| 在 `globals.css` **顶部**加入 `@import url("https://fonts.googleapis.com/...")` | `check:no-third-party` 退出码 **1**，定位到 `.next/static/chunks/*.css` |
| 在 `layout.tsx` 中加入 `<script src="https://cdn.jsdelivr.net/...">` | `check:no-third-party` 退出码 **1**，定位到 SSR HTML |
| 两者移除后 | 退出码恢复 **0** |

附带发现：把外部 `@import` 放在 `globals.css` **末尾**（其他规则之后）时它会被构建丢弃——因为 CSS 规范要求 `@import` 必须在其他规则之前。第一次探针因此无效，第二次放在顶部才成功触发。

## 待确认

- **响应式视觉验证尚未完成。** 已确认代码使用响应式工具类（`sm:` / `lg:`）且结构语义正确，但按 `docs/testing.md` 第 9 节与规范第 14.5 节，375px 与 1440px 的实际观感属于**手工验收**项。需要安装 Playwright 浏览器（或人工在浏览器中查看）后补做。
- 品牌字体一旦确定，需要替换 `@theme inline` 中的 `--font-sans` 并自托管字体文件；同时需更新本 ADR 与 `docs/dependencies.md`。
