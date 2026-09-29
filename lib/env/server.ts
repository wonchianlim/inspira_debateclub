import "server-only";

import { z } from "zod";

/**
 * 服务端环境变量校验。
 *
 * 依据规范第 5.3 节："Validate required server environment variables at startup."
 * 规范第 7 节要求机密**绝不**能出现在浏览器里。
 *
 * 设计要点：
 *
 * 1. **逐项显式列出**，而不是 `schema.parse(process.env)`。
 *    显式列出有两个好处：只有我们认识的变量会被读取；客户端模块也必须这样写，
 *    因为 Next.js 只会在构建时静态替换 `process.env.NEXT_PUBLIC_X` 这种**字面量**写法，
 *    裸的 `process.env` 在浏览器里是空对象（见 lib/env/client.ts）。
 *
 * 2. **惰性校验 + 缓存**：只有真正用到时才校验，避免 import 就抛错；
 *    校验成功后缓存结果，避免每次访问都重新解析。
 *
 * 3. **错误信息面向非技术读者**：用中文说明缺了哪一项、去哪里补，
 *    并且**绝不**回显任何变量的值（哪怕是部分值）。
 */

/** 现在就必须提供的变量。缺任意一个，应用启动即失败。 */
const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

/** 暂时可选、实现对应功能后才变成必需的变量。 */
const OPTIONAL_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "JOB_DISPATCH_SECRET"] as const;

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "必须是完整网址，例如 https://xxxx.supabase.co",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, { error: "不能为空" }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, { error: "不能为空" }),
  NEXT_PUBLIC_APP_URL: z.url({
    error: "必须是完整网址，例如 https://app.example.com 或 http://localhost:3000",
  }),

  // 可选：允许完全缺失，但一旦提供就不能是空字符串以外的无效值
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  JOB_DISPATCH_SECRET: z.string().min(32, { error: "建议至少 32 个字符" }).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** 把空字符串视为"未提供"，这样 .env 里留空的项不会被误当成有值。 */
function readRaw(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of [...REQUIRED_KEYS, ...OPTIONAL_KEYS]) {
    const value = process.env[key];
    out[key] = value === undefined || value.trim() === "" ? undefined : value;
  }
  return out;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const name = issue.path.join(".") || "(未知变量)";
      return `  · ${name}：${issue.message}`;
    })
    .join("\n");
}

/**
 * 校验并返回服务端环境变量。
 * 校验不通过时抛出带有**面向初学者**说明的错误。
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(readRaw());

  if (!parsed.success) {
    const missing = REQUIRED_KEYS.filter((key) => readRaw()[key] === undefined);

    throw new Error(
      [
        "启动失败：环境变量配置不完整。",
        "",
        missing.length > 0
          ? `缺少这些**必需**的变量：${missing.join("、")}`
          : "必需变量都已提供，但格式不正确。",
        "",
        "具体问题：",
        formatIssues(parsed.error),
        "",
        "怎么修：",
        "  1. 在项目根目录创建 .env.local（可以从 .env.example 复制）；",
        "  2. 按 .env.example 里的说明逐项填写；",
        "  3. 保存后重新启动应用。",
        "",
        "注意：.env.local 已被 .gitignore 忽略，不会被提交，也不要把里面的内容发给别人。",
      ].join("\n"),
    );
  }

  cached = parsed.data;
  return cached;
}

/** 供应用启动时调用，用来"提前失败"。 */
export function assertServerEnv(): void {
  serverEnv();
}

/** 仅供测试使用：清除缓存，以便用不同的环境变量重新校验。 */
export function resetServerEnvCache(): void {
  cached = null;
}

/** 变量名清单，供文档与测试核对，避免文档与实际不一致。 */
export const SERVER_ENV_KEYS = {
  required: REQUIRED_KEYS,
  optional: OPTIONAL_KEYS,
} as const;
