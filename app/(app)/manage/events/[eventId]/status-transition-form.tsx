"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { transitionEventStatusAction } from "@/lib/admin/event-actions";
import { EVENT_STATUS_LABELS, type EventStatus, nextStatuses } from "@/lib/domain/event-lifecycle";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/**
 * 推进活动状态。
 *
 * 用**一个表单 + 多个提交按钮**：每个按钮通过 `name="toStatus" value="..."` 提交不同的目标状态。
 * 这样只需要一个 `useActionState`，而不是每个状态各写一个表单 ——
 * 也不需要为每种跳转各写一个 Server Action。
 *
 * ⚠️ 界面上只显示**允许的**跳转，但这只是体验。真正的判断在服务端
 *    （`lib/domain/event-lifecycle.ts` 的状态机），而且是在写入**之前**判断的，
 *    因此即使有人伪造请求，也不会产生部分写入。
 */
export function StatusTransitionForm({
  eventId,
  currentStatus,
}: {
  eventId: string;
  currentStatus: EventStatus;
}) {
  const [state, formAction, pending] = useActionState(
    transitionEventStatusAction,
    INITIAL_FORM_STATE,
  );

  const allowed = nextStatuses(currentStatus);
  const advance = allowed.filter((status) => status !== "cancelled");
  const canCancel = allowed.includes("cancelled");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage status={state.status} message={state.message} />

      {allowed.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          「{EVENT_STATUS_LABELS[currentStatus]}」是终态，不能再变更状态。
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {advance.map((status) => (
            <Button key={status} type="submit" name="toStatus" value={status} disabled={pending}>
              {pending ? "处理中…" : `推进到「${EVENT_STATUS_LABELS[status]}」`}
            </Button>
          ))}

          {canCancel ? (
            <Button
              type="submit"
              name="toStatus"
              value="cancelled"
              variant="outline"
              disabled={pending}
              /*
                取消是破坏性操作，加一道确认。
                这只是**体验层**的拦截：真正的保证是服务端的状态机与审计触发器。
                故意不用 window.confirm 之外的复杂弹窗，避免在无脚本或屏幕阅读器下不可用。
              */
              onClick={(event) => {
                if (!window.confirm("确定要取消这个活动吗？取消后状态不能恢复。")) {
                  event.preventDefault();
                }
              }}
            >
              取消活动
            </Button>
          ) : null}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        每次状态变更都会自动写入审计日志（谁、什么时候、从什么状态改到什么状态）。
      </p>
    </form>
  );
}
