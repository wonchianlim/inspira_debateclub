"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import {
  generateMatchesAction,
  publishMatchAction,
  startMatchAction,
} from "@/lib/admin/match-actions";

export function GenerateMatchesForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(generateMatchesAction, INITIAL_FORM_STATE);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Generating…" : "Generate rounds"}
        </Button>
        <span className="text-muted-foreground text-xs">
          Rounds that already started are kept; regrouping will not overwrite them.
        </span>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function MatchStatusButtons({
  matchId,
  status,
  rosterLocked,
}: {
  matchId: string;
  status: string;
  rosterLocked: boolean;
}) {
  const [publishState, publishAction, publishing] = useActionState(
    publishMatchAction,
    INITIAL_FORM_STATE,
  );
  const [startState, startAction, starting] = useActionState(startMatchAction, INITIAL_FORM_STATE);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {!publishState.message && status === "scheduled" ? (
          <form action={publishAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <Button type="submit" size="sm" variant="outline" disabled={publishing}>
              {publishing ? "…" : "Publish roster"}
            </Button>
          </form>
        ) : null}

        {!rosterLocked ? (
          <form action={startAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <Button type="submit" size="sm" disabled={starting}>
              {starting ? "…" : "Start round"}
            </Button>
          </form>
        ) : (
          <span className="text-muted-foreground text-xs">Roster locked</span>
        )}
      </div>
      <FormMessage status={publishState.status} message={publishState.message} />
      <FormMessage status={startState.status} message={startState.message} />
    </div>
  );
}
