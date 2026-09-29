import { CircleCheck, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * 表单提交结果的统一呈现。
 *
 * 可访问性（主规格第 13 节）：
 *   - 错误用 `role="alert"`（立即播报），成功用 `role="status"`（礼貌播报）；
 *   - **同时**有图标与文字，不靠颜色单独表达状态。
 */
export function FormMessage({ status, message }: { status: string; message?: string }) {
  if (status === "idle" || !message) return null;

  const isError = status === "error";

  return (
    <Alert variant={isError ? "destructive" : "default"} role={isError ? "alert" : "status"}>
      {isError ? <TriangleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
