/**
 * 活动生命周期（主规格第 9.1 节）。
 *
 * 这是**纯领域逻辑**：不碰数据库、不碰界面、不发请求。因此可以用确定性单元测试
 * 覆盖**全部状态组合**，而不是只测几条"常见路径"。
 *
 * 规范原文：
 *
 *     draft → registration_open → registration_closed → pairing → ready → live
 *           → completed → archived
 *
 *     An event may transition to `cancelled` before completion.
 *     Invalid transitions return a domain error and do not partially mutate records.
 *
 * 规范只定义了**状态图**，没有定义额外的前置条件（例如"必须有已确认的比赛才能进入
 * ready"）。因此本模块只实现状态图本身；将来 Phase 4/5 若需要前置条件，
 * 应在调用方（Server Action）里补充检查，而不是把它塞进这里 ——
 * 那样会让"能不能跳转"这个纯问题变得依赖数据库，失去可穷举测试的能力。
 */

import type { Database } from "@/lib/supabase/database.types";

/**
 * 九个状态，**顺序与数据库枚举 `event_status` 一致**。
 * 顺序本身有意义：它就是正常推进的路径。
 */
export const EVENT_STATUSES = [
  "draft",
  "registration_open",
  "registration_closed",
  "pairing",
  "ready",
  "live",
  "completed",
  "archived",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

/**
 * 编译期断言：本文件的状态清单必须与数据库枚举**完全一致**。
 *
 * 为什么需要：两边不一致的后果很隐蔽 —— 例如数据库多了一个状态，
 * 而这里不认识它，`checkTransition` 会把它当成"未知状态"直接拒绝，
 * 表现为"某个活动怎么都推不动"，而测试全绿（因为测试用的是这份清单）。
 *
 * 这段类型断言让不一致在 `tsc` 阶段就编译失败，而 `npm run ci` 会跑 `typecheck`。
 */
type DatabaseEventStatus = Database["public"]["Enums"]["event_status"];
type AssertSame<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** 若下面一行报错，说明本文件的状态清单与数据库枚举已经不一致。 */
const _statusesMatchDatabase: AssertSame<EventStatus, DatabaseEventStatus> = true;
void _statusesMatchDatabase;

/** 给用户看的中文名称。技术状态名不直接展示给非技术用户。 */
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "草稿",
  registration_open: "报名开放中",
  registration_closed: "报名已截止",
  pairing: "配对中",
  ready: "已就绪",
  live: "进行中",
  completed: "已完成",
  archived: "已归档",
  cancelled: "已取消",
};

/**
 * 允许的跳转。
 *
 * 只写"正常推进的下一步"和"取消"。任何未列出的组合都是非法的 ——
 * 包括**回退**（例如 registration_open → draft）和**跳步**（例如 draft → ready）。
 * 规范没有授权这两种操作，因此一律拒绝，而不是"看起来合理就放行"。
 */
const ALLOWED_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["registration_open", "cancelled"],
  registration_open: ["registration_closed", "cancelled"],
  registration_closed: ["pairing", "cancelled"],
  pairing: ["ready", "cancelled"],
  ready: ["live", "cancelled"],
  // 规范说 "may transition to cancelled before completion"：
  // live 尚未 completed，因此仍然可以取消。
  live: ["completed", "cancelled"],
  completed: ["archived"],
  // 终态：不再接受任何变更。
  archived: [],
  cancelled: [],
};

/** 正常推进的顺序（不含 cancelled）。 */
export const EVENT_HAPPY_PATH = [
  "draft",
  "registration_open",
  "registration_closed",
  "pairing",
  "ready",
  "live",
  "completed",
  "archived",
] as const satisfies readonly EventStatus[];

export function isEventStatus(value: string): value is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(value);
}

/** 是否是终态（不能再去任何地方）。 */
export function isTerminalStatus(status: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/** 从当前状态可以去的所有状态。 */
export function nextStatuses(status: EventStatus): readonly EventStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

/**
 * 正常推进的下一步；已经是终态或只能取消时返回 null。
 *
 * 界面上的"推进到下一步"按钮用它决定是否显示。
 */
export function nextHappyPathStatus(status: EventStatus): EventStatus | null {
  const index = EVENT_HAPPY_PATH.indexOf(status as (typeof EVENT_HAPPY_PATH)[number]);
  if (index === -1 || index === EVENT_HAPPY_PATH.length - 1) return null;
  return EVENT_HAPPY_PATH[index + 1];
}

/** 是否允许这次跳转。 */
export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** 失败原因，便于调用方与测试精确判定，而不是去匹配提示文案。 */
export type TransitionErrorCode =
  /** 目标状态不是九种状态之一（例如请求被篡改） */
  | "unknown_status"
  /** 原状态与目标状态相同 */
  | "same_status"
  /** 当前是终态，不能再变更 */
  | "terminal_status"
  /** 状态图不允许这次跳转（回退、跳步或非法组合） */
  | "not_allowed";

export type TransitionCheck =
  | { ok: true; from: EventStatus; to: EventStatus }
  | {
      ok: false;
      from: EventStatus;
      to: string;
      code: TransitionErrorCode;
      /** 可直接展示给用户的中文说明 */
      message: string;
    };

/**
 * 校验一次状态跳转。
 *
 * 刻意**返回结果**而不是抛异常：非法跳转是可预期的业务情况（用户点了不该点的按钮），
 * 不是程序故障。调用方需要拿到中文说明去展示，而不是让整个请求 500。
 *
 * 注意：本函数**不修改任何数据**。规范要求"非法跳转不得产生部分写入" ——
 * 只要调用方在写入之前先调用它，并且只在 ok 时执行写入，这一点就成立。
 */
export function checkEventTransition(from: string, to: string): TransitionCheck {
  if (!isEventStatus(from)) {
    return {
      ok: false,
      from: from as EventStatus,
      to,
      code: "unknown_status",
      message: `无法识别的活动状态「${from}」。`,
    };
  }

  if (!isEventStatus(to)) {
    return {
      ok: false,
      from,
      to,
      code: "unknown_status",
      message: `无法识别的目标状态「${to}」。`,
    };
  }

  if (from === to) {
    return {
      ok: false,
      from,
      to,
      code: "same_status",
      message: `活动已经处于「${EVENT_STATUS_LABELS[from]}」状态，无需变更。`,
    };
  }

  if (isTerminalStatus(from)) {
    return {
      ok: false,
      from,
      to,
      code: "terminal_status",
      message: `活动已经是「${EVENT_STATUS_LABELS[from]}」，不能再变更状态。`,
    };
  }

  if (!canTransition(from, to)) {
    return {
      ok: false,
      from,
      to,
      code: "not_allowed",
      message:
        `不能从「${EVENT_STATUS_LABELS[from]}」直接变为「${EVENT_STATUS_LABELS[to]}」。` +
        `可选的下一步是：${nextStatuses(from)
          .map((s) => EVENT_STATUS_LABELS[s])
          .join("、")}。`,
    };
  }

  return { ok: true, from, to };
}
