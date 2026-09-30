"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { saveJudgeProfileAction } from "@/lib/judge/profile-actions";

/**
 * 裁判填写自己的执裁理念与经验。
 *
 * 规范第 15 节 Phase 8 要求 "profile/**paradigm** experience" ——
 * paradigm 是辩论圈的说法：这位裁判看重什么、怎么判、给分尺度如何。
 * 学生与教练在赛前能看到它，就知道会遇到什么样的裁判。
 */
export function JudgeProfileForm({
  paradigm,
  experienceNotes,
}: {
  paradigm: string | null;
  experienceNotes: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveJudgeProfileAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="paradigm" className="text-sm">
          执裁理念（paradigm）
        </Label>
        <p className="text-muted-foreground text-xs">
          你更看重什么？例如「我更看重比较与权衡，不奖励单纯的证据堆砌」。
          写得具体一点，参赛者就知道该怎么准备。
        </p>
        <textarea
          id="paradigm"
          name="paradigm"
          rows={5}
          disabled={pending}
          defaultValue={paradigm ?? ""}
          className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="experienceNotes" className="text-sm">
          执裁经验
        </Label>
        <p className="text-muted-foreground text-xs">
          你判过什么比赛、受过什么训练、擅长哪些赛制。
        </p>
        <textarea
          id="experienceNotes"
          name="experienceNotes"
          rows={4}
          disabled={pending}
          defaultValue={experienceNotes ?? ""}
          className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "保存中…" : "保存"}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
