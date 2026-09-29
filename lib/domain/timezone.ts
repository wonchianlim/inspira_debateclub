/**
 * 时区换算（纯领域逻辑）。
 *
 * 为什么需要：规范第 6.3 节要求 `event_date` 必须等于 `starts_at` 在**活动时区**下的日期，
 * 并且数据库里有一条触发器强制这一点。管理员在界面上输入的是"本地时间"
 * （例如"2026-10-15 18:00，上海"），而数据库存的是 UTC 时刻。
 * 两者之间的换算必须正确，否则会出现"活动日期差一天"这种很难排查的问题。
 *
 * 为什么不用第三方库：规范第 5.1 节要求不引入无必要依赖；而且时区换算依赖运行时的
 * IANA 时区数据库，Node 与浏览器都已经内置（通过 `Intl`）。
 *
 * ⚠️ 本文件不依赖 `Date` 的本地时区：所有计算都显式指定时区，
 *    因此在任何机器（无论系统时区是上海还是纽约）上结果都一致。
 */

/**
 * 俱乐部的默认时区。
 *
 * 用途：有些地方需要一个"输入本地时间但没有单独时区字段"的默认值，
 * 例如通知的定时发布时间（`notices.published_at` 是 timestamptz，
 * 表里没有时区列）。活动有自己的 `timezone` 列，不使用这个默认值。
 */
export const CLUB_DEFAULT_TIMEZONE = "Asia/Shanghai";

const MS_PER_MINUTE = 60_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** 时区是否被运行时认识。不认识时 `Intl` 会抛错，这里提前给出明确结果。 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedPartsOf(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: string) => {
    const found = parts.find((part) => part.type === type);
    if (!found) throw new Error(`时区格式缺少字段：${type}`);
    return Number(found.value);
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // 某些实现在午夜会给出 24 而不是 0
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** 该时刻在指定时区相对 UTC 的偏移（分钟，东为正）。 */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = zonedPartsOf(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // 抹掉毫秒，避免因毫秒差产生 1 分钟误差
  const instantSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return (asIfUtc - instantSeconds) / MS_PER_MINUTE;
}

/** 形如 `2026-10-15T18:00` 或 `2026-10-15T18:00:30` 的本地时间字符串。 */
export type LocalDateTimeString = string;

function parseLocalDateTime(value: LocalDateTimeString): ZonedParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`本地时间格式不正确：${value}（应为 2026-10-15T18:00）`);
  }
  const [, year, month, day, hour, minute, second] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second ?? 0),
  };
}

/**
 * 把"某时区的本地时间"换算成 UTC 时刻。
 *
 * 做法：先假设它就是 UTC，再按该时刻的时区偏移修正。
 * **修正要做两次**：夏令时切换当天，第一次修正可能落到另一个偏移上，
 * 用修正后的时刻再取一次偏移才稳定。
 */
export function zonedTimeToUtc(local: LocalDateTimeString, timeZone: string): Date {
  const parts = parseLocalDateTime(local);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let instant = new Date(asIfUtc - zoneOffsetMinutes(new Date(asIfUtc), timeZone) * MS_PER_MINUTE);
  // 第二次修正（处理夏令时切换）
  instant = new Date(asIfUtc - zoneOffsetMinutes(instant, timeZone) * MS_PER_MINUTE);
  return instant;
}

/** 把 UTC 时刻格式化成某时区的本地时间字符串（用于回填表单）。 */
export function utcToZonedLocal(instant: Date, timeZone: string): LocalDateTimeString {
  const parts = zonedPartsOf(instant, timeZone);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return (
    `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}` +
    `T${pad(parts.hour)}:${pad(parts.minute)}`
  );
}

/**
 * UTC 时刻在指定时区下的**日期**（`YYYY-MM-DD`）。
 *
 * 这正是 `events.event_date` 需要的值：它必须等于 `starts_at` 在活动时区下的日期。
 * 上海是 UTC+8，因此"北京时间 10 月 15 日 00:30 开始"对应 UTC 是 10 月 14 日 16:30，
 * 活动日期应当是 **10-15** 而不是 10-14。这类错误在手工填写时非常容易发生。
 */
export function zonedDateOf(instant: Date, timeZone: string): string {
  const parts = zonedPartsOf(instant, timeZone);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** 加分钟，返回新对象（不修改入参）。 */
export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}
