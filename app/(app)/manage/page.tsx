import { AreaPlaceholder } from "@/components/domain/area-placeholder";

export const metadata = { title: "俱乐部管理 · INSPIRA" };

export const dynamic = "force-dynamic";

export default function ManageAreaPage() {
  return (
    <AreaPlaceholder
      title="俱乐部管理"
      phase="Phase 2 起"
      description="活动与赛制管理在 Phase 2；报名管理在 Phase 3；配对在 Phase 4；比赛、房间与裁判指派在 Phase 5；现场签到看板在 Phase 6；评分表与复核在 Phase 7。"
    />
  );
}
