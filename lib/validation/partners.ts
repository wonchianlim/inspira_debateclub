import { z } from "zod";

/**
 * 搭档请求的输入校验。
 *
 * 搭档码由服务端按码查找，前端**只提交码本身**，不提交任何学生 id ——
 * 这一点很重要：如果前端能直接提交 id，就等于绕过了"必须知道对方的码"这个前提。
 */

/** 与生成器一致的字符集：数字 2-9 与大写字母（排除 0/O、1/I/L）。 */
const PARTNER_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,16}$/;

export const partnerCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => PARTNER_CODE_PATTERN.test(value), {
    error: "搭档码格式不正确。它由大写字母和数字组成（不含 0、O、1、I、L）。",
  });

export const sendPartnerRequestSchema = z.object({
  eventId: z.guid({ error: "活动标识格式不正确" }),
  partnerCode: partnerCodeSchema,
});

export const respondToPartnerRequestSchema = z.object({
  requestId: z.guid({ error: "请求标识格式不正确" }),
  decision: z.enum(["accepted", "unavailable"], { error: "请选择接受或拒绝" }),
});

export const cancelPartnerRequestSchema = z.object({
  requestId: z.guid({ error: "请求标识格式不正确" }),
});

export const PARTNER_REQUEST_STATUS_LABELS = {
  pending: "等待对方回应",
  accepted: "已接受",
  unavailable: "对方无法搭档",
  replaced: "已被替换",
  cancelled: "已撤回",
} as const;

/**
 * 必须说清楚的一句话：**被接受的搭档请求是"强烈偏好"，不是保证。**
 *
 * 规范第 6.3 节原文："An accepted request is a strong pairing preference,
 * not a guarantee." 配对时仍可能因为人数、赛制或评分平衡而无法满足。
 * 不写清楚的话，学生会以为"接受了就一定会一起"，到时候会很失望。
 */
export const PARTNER_IS_PREFERENCE_NOT_GUARANTEE =
  "对方接受后，配时会优先把你俩配在一起，但这不是保证 —— 如果人数或评分不平衡，仍可能分开。";
