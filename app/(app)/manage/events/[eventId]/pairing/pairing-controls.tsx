"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import {
  confirmProposalAction,
  dissolveTeamAction,
  generateProposalAction,
  setTeamLockAction,
} from "@/lib/admin/pairing-actions";

/** 生成提案。 */
export function GenerateForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(generateProposalAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "生成中…" : "生成配对提案"}
        </Button>
        <span className="text-muted-foreground text-xs">
          已锁定或人工调整过的队伍会被保留，不会被覆盖。
        </span>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** 锁定 / 解锁一支队伍。 */
export function TeamLockButton({ teamId, locked }: { teamId: string; locked: boolean }) {
  const [state, formAction, pending] = useActionState(setTeamLockAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="locked" value={locked ? "false" : "true"} />
      <Button type="submit" size="sm" variant={locked ? "secondary" : "outline"} disabled={pending}>
        {pending ? "…" : locked ? "已锁定（点击解锁）" : "锁定"}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** 解散一支队伍。 */
export function DissolveTeamButton({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState(dissolveTeamAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="teamId" value={teamId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={(event) => {
          if (!window.confirm("确定要解散这支队伍吗？相关同学的参与记录不会被删除。")) {
            event.preventDefault();
          }
        }}
      >
        {pending ? "…" : "解散"}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** 确认提案。 */
export function ConfirmProposalButton({ proposalId }: { proposalId: string }) {
  const [state, formAction, pending] = useActionState(confirmProposalAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "确认中…" : "确认这份提案"}
        </Button>
        <span className="text-muted-foreground text-xs">
          确认后队伍变为「已确认」。此前的每次改动都已记录在审计日志里。
        </span>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
