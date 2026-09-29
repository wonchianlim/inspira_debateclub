// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 活动动作的保护措施（源码级）。
 *
 * 为什么读源码而不是直接调用：这些动作依赖 `next/cache`、`next/navigation`
 * 与数据库连接，在单元测试环境里无法执行。状态机本身已被穷举测试覆盖
 * （见 `event-lifecycle.test.ts`），这里守住的是**动作里的执行顺序与权限检查**。
 *
 * 顺序为什么重要：规范要求"非法跳转不得产生部分写入"。
 * 只有在**写入之前**判断状态，这一点才成立 ——
 * 若有人把判断挪到写入之后，所有功能测试仍然会通过（非法跳转最终还是报错），
 * 但数据库里已经留下了一次非法变更。这种改动没有任何测试能发现，除了这一条。
 */
const source = readFileSync(resolve(process.cwd(), "lib/admin/event-actions.ts"), "utf8");

/** 取出某个导出函数的主体（到下一个 export async function 为止）。 */
function bodyOf(actionName: string): string {
  const start = source.indexOf(`export async function ${actionName}(`);
  if (start === -1) throw new Error(`未找到动作：${actionName}`);
  const next = source.indexOf("export async function", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

describe("活动动作的基本约束", () => {
  it("是 server action 文件", () => {
    expect(source.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("每个改动活动的动作都先检查管理员身份", () => {
    for (const action of [
      "createEventAction",
      "updateEventAction",
      "cloneEventAction",
      "setEventFormatsAction",
      "transitionEventStatusAction",
    ]) {
      const body = bodyOf(action);
      expect(body, `${action} 应当检查管理员身份`).toContain("requireManager()");
    }
  });

  it("没有物理删除活动的代码", () => {
    expect(source).not.toMatch(/from\("events"\)\s*\.delete\(/);
  });
});

describe("状态流转：先判断、再写入", () => {
  const body = bodyOf("transitionEventStatusAction");

  it("调用了状态机", () => {
    expect(body).toContain("checkEventTransition");
  });

  it("状态机判断早于数据库写入", () => {
    const checkIndex = body.indexOf("checkEventTransition");
    const writeIndex = body.indexOf(".update({ status: toStatus })");
    expect(checkIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeLessThan(writeIndex);
  });

  it("非法跳转直接返回，不继续执行写入", () => {
    // check.ok 为 false 时必须 return
    expect(body).toMatch(/if \(!check\.ok\)\s*\{[\s\S]*?return /);
  });

  it("先把当前状态读出来（否则无法判断能不能跳）", () => {
    const readIndex = body.indexOf("getEventDetail");
    const writeIndex = body.indexOf(".update({ status: toStatus })");
    expect(readIndex).toBeGreaterThan(-1);
    expect(readIndex).toBeLessThan(writeIndex);
  });
});

describe("创建与克隆的状态初始值", () => {
  it("新建的活动一律是草稿（不能一创建就公开）", () => {
    const body = bodyOf("createEventAction");
    expect(body).toContain('status: "draft"');
  });

  it("克隆出的活动也是草稿（沿用原状态会造成'一创建就在报名'的误解）", () => {
    const body = bodyOf("cloneEventAction");
    expect(body).toContain('status: "draft"');
  });
});
