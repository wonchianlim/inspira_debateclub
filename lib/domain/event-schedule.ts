/**
 * 活动时间安排的**默认值**计算（纯领域逻辑）。
 *
 * 背景：规范第 6.3 节要求活动有六个时间点（报名开放/截止、签到开放、警示、开始、结束）。
 * 管理员每次新建活动都要填六个时间很不现实，因此由"开始时间 + 偏移量"推算默认值。
 *
 * ⚠️ 关于这些偏移量：规范**没有规定具体数值**。
 *    产品负责人尚未提供（这是计划中记录的待确认项 O-2）。
 *    因此它们被做成**可配置的系统设置**（见 lib/admin/settings.ts），
 *    这里的默认值是**占位值**，管理员可以在界面上逐个修改，
 *    也可以在系统设置里改全局默认，**不需要改代码**。
 */

export type ScheduleOffsets = {
  /** 报名在活动开始前几天开放 */
  registrationOpensDaysBefore: number;
  /** 报名在活动开始前几天截止 */
  registrationClosesDaysBefore: number;
  /** 签到在活动开始前几分钟开放（规范第 9.4 节明确写的是 30 分钟） */
  checkInOpensMinutesBefore: number;
  /** 警示在活动开始前几分钟触发 */
  warningMinutesBefore: number;
};

/**
 * 占位默认值。
 *
 * 「签到提前 30 分钟」来自规范第 9.4 节第 1 条，是有依据的；
 * 其余三项规范没有规定，属于待产品负责人确认的占位值。
 */
export const DEFAULT_SCHEDULE_OFFSETS: ScheduleOffsets = {
  registrationOpensDaysBefore: 7,
  registrationClosesDaysBefore: 1,
  checkInOpensMinutesBefore: 30,
  warningMinutesBefore: 10,
};

const MINUTES_PER_DAY = 24 * 60;

/** 把偏移量换算成分钟数，便于统一计算。 */
export function offsetsToMinutes(offsets: ScheduleOffsets) {
  return {
    registrationOpensMinutesBefore: offsets.registrationOpensDaysBefore * MINUTES_PER_DAY,
    registrationClosesMinutesBefore: offsets.registrationClosesDaysBefore * MINUTES_PER_DAY,
    checkInOpensMinutesBefore: offsets.checkInOpensMinutesBefore,
    warningMinutesBefore: offsets.warningMinutesBefore,
  };
}

function minusMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() - minutes * 60_000);
}

/**
 * 由开始时间推算其余四个时间点的默认值。
 *
 * 结束时间**不推算**：规范的示例里活动通常一小时左右，但不同赛制差别很大，
 * 与其猜一个，不如让管理员明确填写（表单里会给一个一小时的初值作为便利，
 * 但那只是界面初值，不是"业务默认值"）。
 */
export function computeDefaultSchedule(startsAt: Date, offsets: ScheduleOffsets) {
  const minutes = offsetsToMinutes(offsets);
  return {
    registrationOpensAt: minusMinutes(startsAt, minutes.registrationOpensMinutesBefore),
    registrationClosesAt: minusMinutes(startsAt, minutes.registrationClosesMinutesBefore),
    checkInOpensAt: minusMinutes(startsAt, minutes.checkInOpensMinutesBefore),
    warningAt: minusMinutes(startsAt, minutes.warningMinutesBefore),
  };
}

/** 偏移量是否合法（用于校验系统设置里的值）。 */
export function isValidOffsets(offsets: ScheduleOffsets): boolean {
  return (
    Number.isInteger(offsets.registrationOpensDaysBefore) &&
    offsets.registrationOpensDaysBefore >= 0 &&
    Number.isInteger(offsets.registrationClosesDaysBefore) &&
    offsets.registrationClosesDaysBefore >= 0 &&
    Number.isInteger(offsets.checkInOpensMinutesBefore) &&
    offsets.checkInOpensMinutesBefore >= 0 &&
    Number.isInteger(offsets.warningMinutesBefore) &&
    offsets.warningMinutesBefore >= 0 &&
    // 报名开放必须早于报名截止，否则推算出来的时间会违反数据库约束
    offsets.registrationOpensDaysBefore > offsets.registrationClosesDaysBefore
  );
}
