import { StatePanel } from "@/components/domain/state-panel";
import { AppShell } from "@/components/layout/app-shell";

/**
 * 路由级加载状态。规范第 13 节要求每个主要页面都有明确的加载表现。
 * 由 Next.js 在页面数据未就绪时自动渲染。
 */
export default function Loading() {
  return (
    <AppShell>
      <StatePanel variant="loading" description="正在准备页面内容…" />
    </AppShell>
  );
}
