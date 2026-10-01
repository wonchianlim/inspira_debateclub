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
          {pending ? "Generating…" : "Generate pairings"}
        </Button>
        <span className="text-muted-foreground text-xs">
          Locked and hand-edited teams are kept and will not be overwritten.
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
        {pending ? "…" : locked ? "Locked (click to unlock)" : "Lock"}
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
          if (!window.confirm("Disband this team? The students' participation records are kept.")) {
            event.preventDefault();
          }
        }}
      >
        {pending ? "…" : "Disband"}
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
          {pending ? "Confirming…" : "Confirm this proposal"}
        </Button>
        <span className="text-muted-foreground text-xs">
          Confirming marks the teams as confirmed. Every change so far is already in the audit log.
        </span>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
