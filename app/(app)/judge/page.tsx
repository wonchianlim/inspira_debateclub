import { AreaPlaceholder } from "@/components/domain/area-placeholder";

export const metadata = { title: "裁判区域 · INSPIRA" };

export const dynamic = "force-dynamic";

export default function JudgeAreaPage() {
  return (
    <AreaPlaceholder
      title="裁判区域"
      phase="Phase 5 起"
      description="可用性登记与被指派的比赛将在 Phase 5 建设；填写与提交评分表在 Phase 7；历史记录在 Phase 8。"
    />
  );
}
