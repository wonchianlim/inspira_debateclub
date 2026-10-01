"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { reviewRequestTone } from "@/components/domain/status-tone";
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
    open: "Open",
    reviewing: "In progress",
    resolved: "Resolved",
    rejected: "Declined",
  };

  const open = requests.filter((request) => request.status === "open");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-medium">Review requests from students</h2>
        <span className="text-muted-foreground text-xs">
          {requests.length} total{open.length > 0 ? `, ${open.length} open` : ""}
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
              Round {request.matchNumber} · {request.roomName}
            </strong>
            <MetaChip>{request.formatCode}</MetaChip>
            <StatusBadge tone={reviewRequestTone(request.status)}>
              {statusLabels[request.status] ?? request.status}
            </StatusBadge>
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
              Your reply: <span className="text-foreground">{request.adminResponse}</span>
            </p>
          ) : null}

          {request.status === "resolved" || request.status === "rejected" ? null : (
            <div className="flex flex-col gap-2">
              {activeId === request.requestId ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`response-${request.requestId}`} className="text-xs">
                    Reply to the student (required to resolve or decline; at least 5 characters)
                  </Label>
                  <Input
                    id={`response-${request.requestId}`}
                    value={response}
                    disabled={pending}
                    placeholder="e.g. Checked the recording; the second point was indeed missed, and the judge has been asked to correct it."
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
                      {target === "reviewing" ? "Mark as in progress" : null}
                      {target === "resolved" ? "Resolve and reply" : null}
                      {target === "rejected" ? "Decline with a reason" : null}
                    </Button>
                  </form>
                ))}
              </div>

              {activeId === request.requestId && response.trim().length < 5 ? (
                <span className="text-muted-foreground text-xs">
                  Write the reply first, then choose Resolve or Decline
                </span>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
