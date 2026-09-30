import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";

/**
 * 根路径。
 *
 * ⚠️ 这里**曾经是一个 Phase 1 的占位页**，上面写着
 * "报名、配对、比赛与评分表功能属于后续阶段，**尚未实现**"。
 *
 * 那句话在 Phase 9 之后**已经不成立**了，但页面一直没改 ——
 * 于是学生打开网址看到的第一句话是"系统还没做"。
 * **上线时才发现**，因为之前没有任何一步会渲染根路径。
 *
 * 现在改成纯跳转：
 *   - 没登录 → 登录页
 *   - 已登录 → `/dashboard`，由它按角色优先级转到对应区域
 *     （规范第 8 节："role-aware redirect/overview"）
 *
 * 因此根路径**不需要任何界面**，也不该有 —— 它只是一个入口。
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionContext();
  redirect(session ? "/dashboard" : "/login");
}
