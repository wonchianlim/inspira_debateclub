"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { transitionBallotAction } from "@/lib/admin/ballot-review-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/**
 * 重开 / 发布按钮（Phase 7 / P7-5）。
 *
 * 重开**必须给理由** —— 那是"要求更正"与"随手改改"的分界线，
 * 而且数据库函数也会拒绝没有理由的重开。因此界面在点"重开"时
 * **先展开一个理由输入框**，而不是让人点下去才发现要填。
 *
 * 这与模式一致：不让用户看到会失败的操作。
 */
export function ReviewButtons({
  ballotId,
  matchId,
  eventId,
  canReopen,
  canPublish,
}: {
  ballotId: string;
  matchId: string;
  eventId: string;
  canReopen: boolean;
  canPublish: boolean;
}) {
  const [state, formAction, pending] = useActionState(transitionBallotAction, INITIAL_FORM_STATE);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  if (!canReopen && !canPublish) {
    return <span className="text-muted-foreground text-xs">Nothing to do in this state</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="ballotId" value={ballotId} />
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="reason" value={reason} />

        {canPublish ? (
          <>
            <input type="hidden" name="to" value="published" />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "…" : "Publish"}
            </Button>
          </>
        ) : null}
      </form>

      {canReopen ? (
        <div className="flex flex-col gap-2">
          {showReason ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`reason-${ballotId}`} className="text-xs">
                Reason for reopening (at least 5 characters; goes into the audit log)
              </Label>
              <Input
                id={`reason-${ballotId}`}
                value={reason}
                disabled={pending}
                onChange={(event) => setReason(event.target.value)}
                className="max-w-md"
              />
            </div>
          ) : null}

          <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="ballotId" value={ballotId} />
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="to" value="reopened" />
            <input type="hidden" name="reason" value={reason} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={pending || (showReason && reason.trim().length < 5)}
              onClick={() => setShowReason(true)}
            >
              {pending ? "…" : "Reopen (ask for a correction)"}
            </Button>
            {showReason && reason.trim().length < 5 ? (
              <span className="text-muted-foreground text-xs">Enter a reason first</span>
            ) : null}
          </form>
        </div>
      ) : null}

      <FormMessage status={state.status} message={state.message} />
    </div>
  );
}
