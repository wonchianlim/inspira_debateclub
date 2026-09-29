"use client";

import { StatePanel } from "@/components/domain/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

/**
 * 路由级错误边界（必须是 Client Component）。
 *
 * 规范第 13 节要求错误状态有明确表现；
 * `AGENTS.md` 的 Code Quality 要求"不吞掉错误"——因此这里把技术细节
 * 记录到控制台（便于排查），但只向用户展示安全的中文提示，
 * 且**不**把原始错误信息渲染到页面上（可能含敏感内容）。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 只记录到控制台；生产环境的服务端日志由容器收集。
    console.error("页面渲染失败:", error);
  }, [error]);

  return (
    <AppShell>
      <StatePanel
        variant="error"
        description="页面加载时出现问题。可以点下面重试；若持续失败，请把当前页面地址发给管理员。"
        action={
          <Button variant="outline" size="sm" onClick={reset}>
            重试
          </Button>
        }
      />
    </AppShell>
  );
}
