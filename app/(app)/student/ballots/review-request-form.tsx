"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { createBallotReviewRequestAction } from "@/lib/student/ballot-actions";

/**
 * 学生对已发布的评分表提出复核请求。
 *
 * 刻意**不做成"一键抗议"**：先要求写清楚问题（至少 10 个字），
 * 否则管理员收到的只会是"我不服"，那对谁都没用。
 */
export function ReviewRequestForm({
  ballotId,
  existingStatus,
}: {
  ballotId: string;
  existingStatus: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    createBallotReviewRequestAction,
    INITIAL_FORM_STATE,
  );

  if (existingStatus) {
    const labels: Record<string, string> = {
      open: "已提交，等待管理员处理",
      reviewing: "管理员正在处理",
      resolved: "已处理",
      rejected: "管理员认为无需修改",
    };
    return (
      <p className="text-muted-foreground text-sm">
        复核请求：{labels[existingStatus] ?? existingStatus}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="ballotId" value={ballotId} />
      <label htmlFor={`reason-${ballotId}`} className="text-sm font-medium">
        对这份评分表有疑问？写下来交给管理员
      </label>
      <textarea
        id={`reason-${ballotId}`}
        name="reason"
        rows={2}
        required
        minLength={10}
        disabled={pending}
        placeholder="例如：我的内容分是 24，但我说的第二点和第三点没有被记录在论点里。"
        className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 text-sm"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
        {pending ? "提交中…" : "提交复核请求"}
      </Button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
