"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateJudgeNotesAction } from "@/lib/admin/judge-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

export function NotesForm({
  judgeProfileId,
  paradigm,
  experienceNotes,
}: {
  judgeProfileId: string;
  paradigm: string | null;
  experienceNotes: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateJudgeNotesAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="judgeProfileId" value={judgeProfileId} />
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paradigm">裁判范式</Label>
        <Input
          id="paradigm"
          name="paradigm"
          defaultValue={paradigm ?? ""}
          maxLength={200}
          disabled={pending}
          aria-describedby="paradigm-hint"
        />
        <p id="paradigm-hint" className="text-muted-foreground text-xs">
          一句话说明这位裁判的评判风格，最多 200 字。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="experienceNotes">经验备注</Label>
        <textarea
          id="experienceNotes"
          name="experienceNotes"
          defaultValue={experienceNotes ?? ""}
          maxLength={2000}
          rows={5}
          disabled={pending}
          aria-describedby="notes-hint"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
        />
        <p id="notes-hint" className="text-muted-foreground text-xs">
          内部记录，仅管理员可见，最多 2000 字。
        </p>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : "保存"}
      </Button>
    </form>
  );
}
