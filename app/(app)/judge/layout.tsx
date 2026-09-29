import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";

/**
 * 裁判区域的访问控制。
 *
 * ⚠️ 这是**服务端**检查，且落在 layout 上，因此该区域下**所有**子页面都受保护，
 *    将来新增页面时不会漏掉。
 *
 * 越权时调用 `forbidden()`，返回真正的 **HTTP 403**（而不是跳转到一个 200 的提示页），
 * 这样监控与日志才能区分"页面不存在"与"没有权限"。对应界面见 app/forbidden.tsx。
 */
export const dynamic = "force-dynamic";

export default async function JudgeAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(AREA_ROLES.judge);
  return children;
}
