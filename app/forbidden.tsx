import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

/**
 * 403 页面（由 `forbidden()` 触发，见 next.config.ts 的说明）。
 *
 * 措辞刻意保持中性（主规格第 8 节）：不透露"是否存在这样一条记录"，
 * 只说明"你的账号没有访问这个区域的权限"。
 */
export default function Forbidden() {
  return (
    <AppShell>
      <StatePanel
        variant="unauthorized"
        title="没有访问权限"
        description="你的账号角色无法访问这个区域。如果你认为这是错误的，请联系俱乐部管理员。"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">返回概览</Link>
          </Button>
        }
      />
    </AppShell>
  );
}
