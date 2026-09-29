import { NextResponse } from "next/server";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";

/**
 * 健康检查端点（docs/architecture.md 第 15 节）。
 *
 * 用途：供云平台的存活/就绪探针使用，也让 P1-10 能验证"容器里真的能连上数据库"。
 *
 * 设计要点：
 *   - 强制动态渲染，不做缓存（否则探针会一直拿到旧结果）；
 *   - 只做一次**极其轻量**的查询，避免探针本身给数据库带来压力；
 *   - 失败时返回 **503**，而不只是把状态写进 JSON —— 探针看的是状态码；
 *   - **不回显任何错误细节**（可能含连接串、主机名等内部信息），
 *     诊断信息只写服务端日志。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    const supabase = createServiceRoleSupabaseClient();

    // 只取一行、不需要具体内容：目的只是确认数据库可达且查询能成功。
    const { error } = await supabase
      .from("debate_formats")
      .select("code", { count: "exact", head: true });

    if (error) throw error;

    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // 仅在服务端记录细节；对外只给一个笼统的状态。
    console.error("[health] 数据库检查失败:", error);

    return NextResponse.json(
      { status: "degraded", database: "error", timestamp: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
