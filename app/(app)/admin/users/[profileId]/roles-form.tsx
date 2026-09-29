"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { setUserRolesAction } from "@/lib/admin/actions";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/** 每个角色的中文说明，帮助管理员判断该不该授予。 */
const ROLE_HINTS: Record<AppRole, string> = {
  student: "可以报名活动、查看自己的评分表与历史。",
  judge: "可以填写被指派比赛的评分表。需要先审批通过才会被指派。",
  coach: "可以查看学生的运营数据与历史，并维护自己的私人笔记。对评分只读。",
  club_manager: "可以创建与管理活动、赛制、通知，并处理报名与配对。",
  super_admin: "拥有全部权限，包括授予角色与维护系统设置。请谨慎授予。",
};

export function RolesForm({
  profileId,
  currentRoles,
}: {
  profileId: string;
  currentRoles: AppRole[];
}) {
  const [state, formAction, pending] = useActionState(setUserRolesAction, INITIAL_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="profileId" value={profileId} />
      <FormMessage status={state.status} message={state.message} />

      {/*
        用 fieldset + legend 把这一组复选框组织成一个语义单元，
        屏幕阅读器会读成"角色，一组选项"，而不是一堆孤立的复选框。
      */}
      <fieldset className="flex flex-col gap-3" disabled={pending}>
        <legend className="sr-only">角色</legend>

        {APP_ROLES.map((role) => (
          <div key={role} className="flex items-start gap-3">
            <input
              type="checkbox"
              id={`role-${role}`}
              name="roles"
              value={role}
              defaultChecked={currentRoles.includes(role)}
              className="accent-primary mt-1 size-4"
            />
            <div className="flex flex-col gap-0.5">
              <label htmlFor={`role-${role}`} className="text-sm font-medium">
                {ROLE_LABELS[role]}
              </label>
              <span className="text-muted-foreground text-xs">{ROLE_HINTS[role]}</span>
            </div>
          </div>
        ))}
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "保存中…" : "保存角色"}
      </Button>

      <p className="text-muted-foreground text-xs">
        取消勾选会<strong>撤销</strong>该角色。系统不允许撤销最后一个超级管理员。
      </p>
    </form>
  );
}
