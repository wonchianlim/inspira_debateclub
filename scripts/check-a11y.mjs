#!/usr/bin/env node
/**
 * 无障碍**静态**检查。
 *
 * -----------------------------------------------------------------------------
 * ⚠️ 这个脚本能做什么、不能做什么 —— 先把边界写清楚
 *
 * 它能做：从**源码**里找出"表单控件没有可访问名称"这一类问题。
 * 这类问题占无障碍问题的大头，而且是**纯静态可判**的。
 *
 * 它**不能**替代真正的无障碍复查。它看不到：
 *   - 对比度是否足够
 *   - 焦点顺序是否合理
 *   - 键盘能否走完整个流程
 *   - 屏幕阅读器实际读出什么
 *
 * 那些需要真实浏览器。**因此这个脚本是"在没有浏览器时能做的最好一步"，
 * 不是"无障碍已经检查过了"。** 报告与文档里必须照这个口径写。
 *
 * -----------------------------------------------------------------------------
 * 判据
 *
 *   1. `<input>` / `<textarea>` / `<select>` 必须有可访问名称：
 *      要么自带 `aria-label` / `aria-labelledby`，
 *      要么有 `id` 且页面里存在 `<Label htmlFor="同一个 id">`。
 *   2. `<img>` 必须有 `alt`（哪怕 `alt=""` —— 那是"装饰性图片"的正确写法）。
 *
 * ⚠️ 用正则而不是 AST 是**刻意的取舍**：这个项目里 JSX 写法很统一，
 *    正则够用且零依赖。代价是它可能误报 —— 误报时**改的是代码或这条规则**，
 *    而不是把检查关掉。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components"];
const problems = [];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) entries.push(...walk(full));
    else if (name.endsWith(".tsx")) entries.push(full);
  }
  return entries;
}

/** 取出一个 JSX 元素的完整属性文本（处理属性里出现的 `>`）。 */
function* elements(source, tag) {
  const pattern = new RegExp(`<${tag}\\b`, "g");
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 0;
    let inString = null;
    let index = match.index + tag.length + 1;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (char === inString && source[index - 1] !== "\\") inString = null;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") inString = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
    }
    yield { text: source.slice(match.index, index + 1), index: match.index };
  }
}

for (const root of ROOTS) {
  let files;
  try {
    files = walk(root);
  } catch {
    continue;
  }

  for (const file of files) {
    /*
     * ⚠️ 跳过 `components/ui/` —— 那些是**通用组件定义**
     * （shadcn 的 Input / Select 等）。它们叫什么名字由**调用方**决定，
     * 组件本身没法写死一个 aria-label。
     * 给它们写死反而会让所有用到的地方读出同一句无意义的名称。
     */
    if (file.includes(`components${path.sep}ui${path.sep}`)) continue;

    const source = readFileSync(file, "utf8");

    // ---- 表单控件的可访问名称 ----
    for (const tag of ["input", "textarea", "select"]) {
      for (const { text, index } of elements(source, tag)) {
        if (/aria-label|aria-labelledby/.test(text)) continue;

        /*
         * ⚠️ 跳过不该要求可访问名称的控件。
         *
         * `type="hidden"` 是表单数据，**不是**给用户看的控件，没有名称可谈。
         * 第一版没跳过它，于是把一堆隐藏字段报成问题 —— 是**检查错了**，
         * 不是代码错了。
         */
        if (/type=["'](hidden|submit|button|reset|image)["']/.test(text)) continue;

        /*
         * ⚠️ 跳过**被 <label> 包裹**的控件。
         *
         * 这是 HTML 原生支持的写法：`<label><input type="checkbox"> 说明文字</label>`
         * —— 控件就拿到了"说明文字"作为可访问名称。
         *
         * 判法：往前找到最近的一个 `<label` 或 `</label>`，
         * 如果 `<label` 更近，说明它还没闭合，控件在它里面。
         *
         * 第一版漏了这一条，把 checkbox 全部误报 —— 又是**检查错了**。
         * 如果当时直接去"修"那 28 处，就会给已经有名称的控件加上多余的 aria-label，
         * 反而可能让屏幕阅读器读出重复的名称。
         */
        const before = source.slice(0, index);
        const lastOpen = before.lastIndexOf("<label");
        const lastClose = before.lastIndexOf("</label>");
        if (lastOpen > lastClose) continue;

        /*
         * ⚠️ 有 id 时，只要文件里**任何地方**有一个 htmlFor 指向它就算有名称。
         *
         * 两种写法都要认：
         *   - `htmlFor="foo"`        —— 字面量
         *   - `htmlFor={\`foo-${i}\`}` —— JSX 表达式（**项目里大量用这种**）
         *
         * 前者用正则匹配，后者退化成"这个 id 出现在某个 htmlFor= 附近"。
         * 第一版只认字面量，于是把一大批用模板字符串写的 Label 全部误报 ——
         * 又是**检查错了**，不是代码错了。
         *
         * 也认 `FormField` 这类封装：它把 Label 藏在自己的实现里，
         * 源码里看不到 htmlFor。判法是"这个 id 被传给了 FormField"。
         */
        const idMatch = /\bid=\{?[`"']([^`"'\}]+)[`"']?\}?/.exec(text);
        if (idMatch) {
          const id = idMatch[1];
          const hasHtmlFor =
            source.includes(`htmlFor="${id}"`) ||
            source.includes(`htmlFor='${id}'`) ||
            source.includes(`htmlFor={\`${id}`) ||
            // 模板字符串带插值的：`type-${index}` —— 只比对前缀
            new RegExp(`htmlFor=\\{\\s*[\`"']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(
              source,
            ) ||
            // 封装组件：id 被当作 prop 传下去
            new RegExp(`<FormField[^>]*\\bid=["']${id}["']`).test(source);
          if (hasHtmlFor) continue;
          problems.push(
            `${file}:${source.slice(0, index).split("\n").length} — <${tag} id="${id}"> 找不到对应的 label（htmlFor 或 FormField），屏幕阅读器读不出它是什么`,
          );
          continue;
        }

        problems.push(
          `${file}:${source.slice(0, index).split("\n").length} — <${tag}> 既没有 aria-label 也没有 id，屏幕阅读器读不出它是什么`,
        );
      }
    }

    // ---- 图片替代文字 ----
    for (const { text, index } of elements(source, "img")) {
      if (/\balt=/.test(text)) continue;
      problems.push(
        `${file}:${source.slice(0, index).split("\n").length} — <img> 缺少 alt（装饰性图片写 alt=""）`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("✗ 无障碍静态检查未通过：\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\n共 ${problems.length} 处。⚠️ 这只覆盖"表单控件的可访问名称"这一类问题，` +
      "不代表无障碍已全面检查（对比度、焦点顺序、键盘流程需要真实浏览器）。",
  );
  process.exit(1);
}

console.log("✓ 无障碍静态检查通过（表单控件可访问名称 + 图片 alt）。");
console.log(
  "  ⚠️ 这只覆盖静态可判的一类问题。对比度、焦点顺序、键盘流程与屏幕阅读器表现" +
    "需要真实浏览器，**尚未检查**。",
);
