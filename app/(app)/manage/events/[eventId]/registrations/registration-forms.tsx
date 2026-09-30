"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminAddRegistrationAction,
  setRegistrationStatusAction,
} from "@/lib/admin/registration-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { ADMIN_REGISTRATION_STATUSES } from "@/lib/validation/admin-registrations";

const STATUS_LABELS: Record<(typeof ADMIN_REGISTRATION_STATUSES)[number], string> = {
  registered: "已报名",
  cancelled: "已取消",
  late_cancelled: "已取消（迟）",
  checked_in: "已签到",
  no_show: "未到场",
};

/** 单条报名的状态修改。管理员可以直接选任何合法状态。 */
export function RegistrationStatusForm({
  registrationId,
  currentStatus,
}: {
  registrationId: string;
  currentStatus: (typeof ADMIN_REGISTRATION_STATUSES)[number];
}) {
  const [state, formAction, pending] = useActionState(
    setRegistrationStatusAction,
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="registrationId" value={registrationId} />
      <div className="flex items-center gap-2">
        <select
          name="status"
          defaultValue={currentStatus}
          disabled={pending}
          aria-label="报名状态"
          className="border-input bg-background h-8 rounded-md border px-2 text-xs focus-visible:ring-3 focus-visible:outline-none"
        >
          {ADMIN_REGISTRATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "…" : "保存"}
        </Button>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** 人工补报名：按搭档码找人。 */
export function AddRegistrationForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(
    adminAddRegistrationAction,
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <Label htmlFor="partnerCode">按搭档码补报名</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="partnerCode"
          name="partnerCode"
          placeholder="例如 JX4GXKDGUS"
          disabled={pending}
          className="max-w-56 font-mono uppercase"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "处理中…" : "补报名"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        用于学生现场报名、或帮学生恢复被误取消的报名。如果已有报名记录，会改回「已报名」而不是新增一条。
      </p>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
