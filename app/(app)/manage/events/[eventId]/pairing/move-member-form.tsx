"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { moveTeamMemberAction } from "@/lib/admin/pairing-actions";

/**
 * 把一位学生移到另一支队伍（规范 10.7 第 1 条）。
 *
 * 下拉选项只列出**同活动同赛制**的其他队伍 —— 跨赛制移动由数据库拒绝，
 * 与其让管理员点了才看到错误，不如一开始就不提供无效选项。
 */
export function MoveMemberForm({
  fromTeamId,
  participationId,
  studentName,
  otherTeams,
}: {
  fromTeamId: string;
  participationId: string;
  studentName: string;
  otherTeams: { teamId: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(moveTeamMemberAction, INITIAL_FORM_STATE);

  if (otherTeams.length === 0) {
    return <span className="text-muted-foreground text-xs">（本赛制没有其他队伍可移动）</span>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="fromTeamId" value={fromTeamId} />
      <input type="hidden" name="participationId" value={participationId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`move-${participationId}`} className="sr-only">
          把 {studentName} 移到
        </label>
        <select
          id={`move-${participationId}`}
          name="toTeamId"
          disabled={pending}
          defaultValue=""
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        >
          <option value="" disabled>
            移到…
          </option>
          {otherTeams.map((team) => (
            <option key={team.teamId} value={team.teamId}>
              {team.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
          {pending ? "…" : "移动"}
        </Button>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
