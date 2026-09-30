/**
 * 参与名额类型（与数据库枚举 `entitlement_type` 一致）。
 *
 * 规范第 10.2 节第 6 条要求"**只在明确选择了额外场次时才分配额外辩论**"。
 * 因此判断"是不是额外场次"必须依据这个类型，而不是依据"这个人还有没有空闲时间"之类的猜测。
 */

export const ENTITLEMENT_TYPES = [
  "weekly_entitlement",
  "extra_paid",
  "extra_complimentary",
  "extra_payment_pending",
] as const;

export type EntitlementType = (typeof ENTITLEMENT_TYPES)[number];

export const ENTITLEMENT_LABELS: Record<EntitlementType, string> = {
  weekly_entitlement: "本周正常名额",
  extra_paid: "额外场次（已付费）",
  extra_complimentary: "额外场次（赠送）",
  extra_payment_pending: "额外场次（待付款）",
};

/**
 * 是否属于"额外场次"。
 *
 * 用前缀判断而不是列举三种：将来若新增 extra_* 类型，这里自动覆盖；
 * 而列举法会**静默漏掉**新类型，导致额外场次被当成正常名额处理。
 */
export function isExtraEntitlement(type: EntitlementType): boolean {
  return type.startsWith("extra_");
}
