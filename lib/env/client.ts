import { z } from "zod";

/**
 * 客户端（浏览器）可见的环境变量。
 *
 * ⚠️ 这个文件里的值会被打包进浏览器代码，**任何人都能看到**。
 * 因此这里**只能**放本来就公开的值（例如 Supabase 的匿名 key）。
 * 绝不要把 service-role key、API 密钥或任何密码放到 NEXT_PUBLIC_ 变量里。
 *
 * 实现要点（很重要，写错会导致浏览器里读不到值）：
 * Next.js 在构建时**静态替换**写成字面量的 `process.env.NEXT_PUBLIC_X`。
 * 它不会替换裸的 `process.env`（浏览器里那是个空对象）。
 * 所以下面必须逐项写字面量，**不能**写成 `schema.parse(process.env)`。
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

/** 允许存在于浏览器可见范围的全部变量名（顺序即下面逐项读取的顺序）。 */
export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

let cached: ClientEnv | null = null;

/**
 * 逐项以**字面量**方式读取，保证 Next.js 能在构建时正确替换。
 * 这也是唯一能让客户端校验在浏览器中真正生效的写法。
 */
function readPublicEnv(): Record<string, string | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const toValue = (value: string | undefined) =>
    value === undefined || value.trim() === "" ? undefined : value;

  return {
    NEXT_PUBLIC_SUPABASE_URL: toValue(url),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: toValue(anonKey),
    NEXT_PUBLIC_APP_URL: toValue(appUrl),
  };
}

/**
 * 校验并返回客户端可见的环境变量。
 * 与 server.ts 一致：惰性校验 + 缓存，避免 import 阶段就抛错。
 */
export function clientEnv(): ClientEnv {
  if (cached) return cached;

  const raw = readPublicEnv();
  const parsed = clientSchema.safeParse(raw);

  if (!parsed.success) {
    const missing = PUBLIC_ENV_KEYS.filter((key) => raw[key] === undefined);

    throw new Error(
      [
        "配置错误：应用缺少必要的公开环境变量。",
        "",
        missing.length > 0 ? `缺少：${missing.join("、")}` : "变量都已提供，但格式不正确。",
        "",
        "怎么修：",
        "  1. 在项目根目录的 .env.local 中补齐这些变量（可参考 .env.example）；",
        "  2. 这些变量以 NEXT_PUBLIC_ 开头，改动后需要**重新构建**才会生效；",
        "  3. 保存后重新启动应用。",
      ].join("\n"),
    );
  }

  cached = parsed.data;
  return cached;
}

/** 仅供测试使用：清除缓存。 */
export function resetClientEnvCache(): void {
  cached = null;
}
