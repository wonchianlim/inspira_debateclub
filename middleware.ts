import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { clientEnv } from "@/lib/env/client";

/**
 * 会话刷新中间件。
 *
 * 职责只有一个：在每次导航时确认登录会话仍然有效，并把刷新后的 cookie 写回响应。
 * 它**不做**权限判断——授权由数据库 RLS（第一层）和 Server Action 里的
 * `requireCapability()`（第二层）负责（见 docs/architecture.md 第 6 节）。
 *
 * ⚠️ 关键点：使用 `getUser()` 而**不是** `getSession()`。
 *
 *   `getSession()` 只是读取并解码 cookie 里的内容，**客户端可以伪造**——
 *   用它做授权判断等于没有授权。
 *   `getUser()` 会带着凭证向认证服务**核实**，因此结果可信。
 *   这是 Supabase 官方反复强调的一点，也是最容易被省掉的一步。
 */
export async function middleware(request: NextRequest) {
  const env = clientEnv();

  // 先按"原样放行"创建响应；下面若刷新了 cookie，会重新创建它。
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 同时更新"请求"和"响应"两侧的 cookie：
          //   - 写到 request 上，让本次请求后续的 Server Component 也能看到新会话；
          //   - 写到 response 上，让浏览器保存下来。
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // 必须调用：它会校验会话，并在需要时触发上面的 setAll 刷新 cookie。
  // 这里刻意**不使用**返回值做任何跳转决策——未登录该看到什么由页面自己决定。
  await supabase.auth.getUser();

  return response;
}

/**
 * 匹配规则：排除静态资源与图片优化请求。
 *
 * 为什么必须排除：中间件会对每个匹配到的请求做一次会话核实。如果连
 * `.js` / `.css` / 图片都走中间件，每个静态资源都会多一次认证服务往返——
 * 在大陆网络下这会明显拖慢首屏（主规格第 14.5 节要求静态资源可正常加载）。
 */
export const config = {
  matcher: [
    /*
     * 匹配除以下之外的所有路径：
     *   - _next/static  （构建产物）
     *   - _next/image   （图片优化）
     *   - favicon.ico
     *   - 常见静态文件扩展名（图片、字体等）
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
