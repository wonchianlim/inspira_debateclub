import type { FormState } from "@/lib/forms/form-state";

/**
 * 自动保存的规则（UI/UX 规范 §9.3）。
 *
 * 规范原文：
 *   "The ballot is **autosaved** and resilient."
 *   "Autosave after a short idle period and on field blur. Display
 *    `Saved just now`, `Saving…`, or `Couldn't save—retrying` without blocking typing."
 *   "On reconnect, reconcile with server version and **never silently overwrite
 *    a newer ballot**."
 *
 * ⚠️ 为什么这些规则要单独成文件、而不是写在组件里：
 * "什么时候允许自动保存"是一条**安全规则**（冲突之后必须停下来），
 * 而组件里的 `if` 没有任何测试覆盖得到 —— 这一点在本项目已经栽过几次。
 * 这里把它写成纯函数，冲突场景可以逐个穷举。
 */

/** 保存动作的返回形状。比通用 `FormState` 多两个字段（见下方说明）。 */
export type BallotDraftState = FormState & {
  /** 保存成功后服务端的新版本（`ballots.updated_at`），供下一次自动保存使用 */
  version?: string;
  /**
   * 版本冲突：服务端上的这一份在我读它之后被别人改过。
   * 界面必须**停止**自动保存，而不是继续覆盖。
   */
  conflict?: boolean;
};

export type AutosaveStatus =
  /** 没有未保存的改动 */
  | "idle"
  /** 有改动，等着空闲计时器到点 */
  | "pending"
  /** 正在保存 */
  | "saving"
  /** 保存成功 */
  | "saved"
  /** 保存失败（会自动重试） */
  | "failed"
  /** 版本冲突 —— 自动保存**必须停**，等裁判决定 */
  | "conflict";

/** 空闲多久之后自动保存。太短会打断打字（每次都发请求），太长会丢更多内容。 */
export const AUTOSAVE_IDLE_MS = 2500;

/** 失败之后隔多久自动重试一次。 */
export const AUTOSAVE_RETRY_MS = 8000;

/** 最多自动重试几次。再失败就交给裁判手动点——无限重试只会一直打服务器。 */
export const AUTOSAVE_MAX_RETRIES = 2;

/**
 * 现在允许自动保存吗。
 *
 * ⚠️ 这是本文件里最重要的一条：**冲突之后一律不允许**。
 * 允许的话，裁判在两个窗口之间的每一次打字都会覆盖对方的修改，
 * 而规范明确要求这件事"never silently"发生。
 */
export function canAutosave(status: AutosaveStatus): boolean {
  return status !== "conflict" && status !== "saving";
}

/** 空字符串与缺省都表示"还没有这一行"，统一成 null 再比。 */
function normalizeVersion(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** 服务端版本与界面持有的版本是否一致。两者都为空（还没有这一行）算一致。 */
export function versionMatches(expected: string | null, actual: string | null): boolean {
  return normalizeVersion(expected) === normalizeVersion(actual);
}

/**
 * 自动保存的状态提示（规范点名的三个词都在里面）。
 *
 * `formatTime` 由调用方传入，好让这个模块不依赖 `Intl` 与当前时间。
 */
export function autosaveLabel(
  status: AutosaveStatus,
  savedAt: Date | null,
  formatTime: (instant: Date) => string,
): string {
  switch (status) {
    case "idle":
      return savedAt ? `已保存 · ${formatTime(savedAt)}` : "";
    case "pending":
      return "有未保存的改动…";
    case "saving":
      return "正在保存…";
    case "saved":
      return savedAt ? `刚刚已保存 · ${formatTime(savedAt)}` : "刚刚已保存";
    case "failed":
      return "没能保存，正在重试…";
    case "conflict":
      return "这份评分表在别处被改过，自动保存已停止";
  }
}

/**
 * 在提交给服务端的数据里写上"我读到的是哪个版本"。
 *
 * - `override` 为 true 时**不带**版本（裁判已经看过冲突提示、明确选择覆盖）；
 * - 其余情况一定带上，服务端据此拒绝过期写入。
 *
 * 注意：`expectedUpdatedAt` 为空字符串表示"我读到的时候还没有这一行"，
 * 这与"字段不存在"是两件事 —— 后者是显式覆盖。
 */
export function withExpectedVersion(
  data: FormData,
  version: string | null,
  override = false,
): FormData {
  if (override) {
    data.set("overwrite", "true");
    data.delete("expectedUpdatedAt");
    return data;
  }
  // ⚠️ 必须把上一次可能留下的 `overwrite` 删掉：
  // 裁判选了"覆盖"、保存成功之后又继续改，下一次自动保存仍然带着 overwrite，
  // 那这条乐观并发就**永久失效**了 —— 之后所有保存都不再检查版本。
  data.delete("overwrite");
  data.set("expectedUpdatedAt", version ?? "");
  return data;
}
