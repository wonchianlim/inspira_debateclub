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
  registered: "Registered",
  cancelled: "Cancelled",
  late_cancelled: "Cancelled late",
  checked_in: "Checked in",
  no_show: "No show",
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
          aria-label="Registration status"
          className="border-input bg-background h-8 rounded-md border px-2 text-xs focus-visible:ring-3 focus-visible:outline-none"
        >
          {ADMIN_REGISTRATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "…" : "Save"}
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
      <Label htmlFor="partnerCode">Add by partner code</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="partnerCode"
          name="partnerCode"
          placeholder="e.g. JX4GXKDGUS"
          disabled={pending}
          className="max-w-56 font-mono uppercase"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Working…" : "Add registration"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        For registering a student on the day, or restoring one that was cancelled by mistake. If a
        record already exists it is set back to registered instead of duplicating.
      </p>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
