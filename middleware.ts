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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
   * 未登录访问受保护区域 → 在这里直接重定向。
   *
   * ⚠️ 为什么必须放在中间件，而不能只靠布局里的 `redirect()`：
   *    实测发现，布局里调用 `redirect()` 时，由于根级 `app/loading.tsx` 建立了
   *    Suspense 边界，页面外壳会**先被流式发送**出去；HTTP 头一旦发出，
   *    Next 就无法再返回 307，只能退化为在 HTML 里插入
   *    `<meta http-equiv="refresh" content="1;url=/login">` 并返回 **200**。
   *    浏览器仍会跳转（用户无感），但状态码不是重定向，
   *    爬虫、监控与日志都无法据此判断"未登录"，而且会先闪一下加载态。
   *
   *    中间件在**任何渲染开始之前**运行，因此能返回真正的 307。
   *
   * 布局里的 `requireSession()` 仍然保留，作为第二道防线（万一中间件被绕过）。
   */
  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

/**
 * 需要登录才能访问的路径前缀（规范第 8 节）。
 *
 * 认证相关页面（/login、/register、/forgot-password、/reset-password）
 * 与公开首页不在其中。
 */
const PROTECTED_PREFIXES = ["/dashboard", "/student", "/judge", "/coach", "/manage", "/admin"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
