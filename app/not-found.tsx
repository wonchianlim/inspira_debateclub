import { StatePanel } from "@/components/domain/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * 404 页面。规范第 13 节要求"空"与"错误"状态有明确表现；
 * 同时规范第 8 节要求未授权访问不能泄漏"记录是否存在"——
 * 因此这里对"找不到"给出中性措辞，不暗示内容是否存在。
 */
export default function NotFound() {
  return (
    <AppShell>
      <StatePanel
        variant="empty"
        title="页面不存在"
        description="这个地址没有对应的页面。可能是链接已失效，或者地址输入有误。"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/">返回首页</Link>
          </Button>
        }
      />
    </AppShell>
  );
}
