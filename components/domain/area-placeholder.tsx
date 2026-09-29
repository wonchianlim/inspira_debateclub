import { StatePanel } from "@/components/domain/state-panel";

/**
 * 区域占位内容。
 *
 * Phase 1 的交付范围是"按角色分流 + 受保护路由"，各区域的具体功能属于后续阶段。
 * 与其在每个区域写一句含糊的"敬请期待"，不如**明确说明属于哪个阶段**——
 * 这样产品负责人能看懂进度，实现者也不会误以为这里已经完成。
 */
export function AreaPlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <StatePanel
        variant="empty"
        title={`此区域的功能将在${phase}建设`}
        description={description}
      />
    </div>
  );
}
