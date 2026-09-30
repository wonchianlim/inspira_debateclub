"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveBallotReviewRequestAction } from "@/lib/admin/ballot-review-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

/**
 * 管理员处理复核请求（Phase 8）。
 *
 * 刻意**要求结束处理时写一句回复** —— 只点一个按钮而学生看不到任何解释，
 * 与不做这个功能没有区别。
 */
export function ReviewRequestPanel({
  eventId,
  requests,
}: {
  eventId: string;
  requests: {
    requestId: string;
    matchNumber: number;
    roomName: string;
    formatCode: string;
    studentName: string;
    reason: string;
    status: string;
    adminResponse: string | null;
    createdAt: string;
  }[];
}) {
  const [state, formAction, pending] = useActionState(
    resolveBallotReviewRequestAction,
    INITIAL_FORM_STATE,
  );
  /** 正在处理哪一条；同时用来决定要不要展开回复框 */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [response, setResponse] = useState("");

  if (requests.length === 0) return null;

  const statusLabels: Record<string, string> = {
    open: "待处理",
    reviewing: "处理中",
    resolved: "已处理",
    rejected: "已驳回",
  };

  const open = requests.filter((request) => request.status === "open");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-medium">学生的复核请求</h2>
        <span className="text-muted-foreground text-xs">
          共 {requests.length} 条{open.length > 0 ? `，其中 ${open.length} 条待处理` : ""}
        </span>
      </div>

      <FormMessage status={state.status} message={state.message} />

      {requests.map((request) => (
        <div
          key={request.requestId}
          className="border-border flex flex-col gap-2 rounded-md border px-3 py-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <strong>
              第 {request.matchNumber} 场 · {request.roomName}
            </strong>
            <Badge variant="outline" className="font-normal">
              {request.formatCode}
            </Badge>
            <Badge
              variant={request.status === "open" ? "default" : "secondary"}
              className="font-normal"
            >
              {statusLabels[request.status] ?? request.status}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {request.studentName} ·{" "}
              {utcToZonedLocal(new Date(request.createdAt), CLUB_DEFAULT_TIMEZONE).replace(
                "T",
                " ",
              )}
            </span>
          </div>

          <p className="whitespace-pre-wrap">{request.reason}</p>

          {request.adminResponse ? (
            <p className="text-muted-foreground">
              你的回复：<span className="text-foreground">{request.adminResponse}</span>
            </p>
          ) : null}

          {request.status === "resolved" || request.status === "rejected" ? null : (
            <div className="flex flex-col gap-2">
              {activeId === request.requestId ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`response-${request.requestId}`} className="text-xs">
                    回复学生（结束处理时必填，至少 5 个字）
                  </Label>
                  <Input
                    id={`response-${request.requestId}`}
                    value={response}
                    disabled={pending}
                    placeholder="例如：已核对录像，第二点确实漏记，已请裁判重开更正。"
                    onChange={(event) => setResponse(event.target.value)}
                    className="max-w-2xl"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {(["reviewing", "resolved", "rejected"] as const).map((target) => (
                  <form key={target} action={formAction}>
                    <input type="hidden" name="requestId" value={request.requestId} />
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="status" value={target} />
                    <input type="hidden" name="response" value={response} />
                    <Button
                      type="submit"
                      size="sm"
                      variant={target === "reviewing" ? "ghost" : "outline"}
                      disabled={pending || (target !== "reviewing" && response.trim().length < 5)}
                      onClick={() => setActiveId(request.requestId)}
                    >
                      {target === "reviewing" ? "标为处理中" : null}
                      {target === "resolved" ? "已处理（回复学生）" : null}
                      {target === "rejected" ? "驳回（说明原因）" : null}
                    </Button>
                  </form>
                ))}
              </div>

              {activeId === request.requestId && response.trim().length < 5 ? (
                <span className="text-muted-foreground text-xs">
                  请先写回复，再点「已处理」或「驳回」
                </span>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
