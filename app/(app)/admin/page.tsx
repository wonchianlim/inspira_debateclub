import { AreaPlaceholder } from "@/components/domain/area-placeholder";

export const metadata = { title: "系统管理 · INSPIRA" };

export const dynamic = "force-dynamic";

export default function AdminAreaPage() {
  return (
    <AreaPlaceholder
      title="系统管理"
      phase="Phase 2 起"
      description="用户与角色管理、赛制维护、裁判审批在 Phase 2。系统设置（system_settings）也已就绪，等待界面。"
    />
  );
}
