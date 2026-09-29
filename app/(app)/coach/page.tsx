import { AreaPlaceholder } from "@/components/domain/area-placeholder";

export const metadata = { title: "教练区域 · INSPIRA" };

export const dynamic = "force-dynamic";

export default function CoachAreaPage() {
  return (
    <AreaPlaceholder
      title="教练区域"
      phase="Phase 8"
      description="学生历史、教练私人笔记与复核请求处理将在 Phase 8 建设。按已确认的结论（PERM-D-2），教练对评分目前是只读。"
    />
  );
}
