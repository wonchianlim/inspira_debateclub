import { AreaPlaceholder } from "@/components/domain/area-placeholder";

export const metadata = { title: "学生区域 · INSPIRA" };

export const dynamic = "force-dynamic";

export default function StudentAreaPage() {
  return (
    <AreaPlaceholder
      title="学生区域"
      phase="Phase 3 起"
      description="报名、赛制偏好、搭档请求将在 Phase 3 建设；签到在 Phase 6；评分表查看在 Phase 7；个人历史在 Phase 8。"
    />
  );
}
