"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import { studentCheckInAction } from "@/lib/admin/check-in-actions";
import {
  cancelRegistrationAction,
  registerForEventAction,
} from "@/lib/student/registration-actions";
import {
  LATE_CANCELLATION_WARNING,
  REGISTRATION_STATUS_LABELS,
  type RegistrationStatus,
} from "@/lib/validation/registrations";

/**
 * 报名 / 取消报名。
 *
 * ⚠️ 只有"已报名"或"已签到"才显示取消按钮；取消时会**提前**告知
 * "截止后取消记为迟取消"，而不是取消之后才发现记录里多了个"迟"字。
 */
export function RegistrationForm({
  eventId,
  registrationId,
  status,
  windowOpen,
  windowMessage,
}: {
  eventId: string;
  registrationId: string | null;
  status: RegistrationStatus | null;
  windowOpen: boolean;
  windowMessage: string;
}) {
  const [registerState, registerAction, registerPending] = useActionState(
    registerForEventAction,
    INITIAL_FORM_STATE,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelRegistrationAction,
    INITIAL_FORM_STATE,
  );
  const [checkInState, checkInAction, checkInPending] = useActionState(
    studentCheckInAction,
    INITIAL_FORM_STATE,
  );

  const isActive = status === "registered" || status === "checked_in";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        当前状态：
        <strong>{status ? REGISTRATION_STATUS_LABELS[status] : "尚未报名"}</strong>
      </p>

      {/*
        签到按钮：规范第 2.8 节要求"学生用一个简单的 Check In 动作"。
        已经签到时**不显示按钮**，只显示状态，避免重复点击。
      */}
      {isActive && status !== "checked_in" ? (
        <form action={checkInAction} className="flex flex-col gap-2">
          <input type="hidden" name="eventId" value={eventId} />
          <FormMessage status={checkInState.status} message={checkInState.message} />
          <Button
            type="submit"
            variant="secondary"
            disabled={checkInPending}
            className="self-start"
          >
            {checkInPending ? "签到中…" : "我要签到"}
          </Button>
          <p className="text-muted-foreground text-xs">
            签到在活动开始前 30 分钟开放。如果你已经到现场但签到失败，请让管理员代为签到。
          </p>
        </form>
      ) : null}

      {isActive ? (
        <form action={cancelAction} className="flex flex-col gap-3">
          <input type="hidden" name="registrationId" value={registrationId ?? ""} />
          <FormMessage status={cancelState.status} message={cancelState.message} />
          <p className="text-muted-foreground text-xs">{LATE_CANCELLATION_WARNING}</p>
          <Button
            type="submit"
            variant="outline"
            disabled={cancelPending}
            className="self-start"
            onClick={(event) => {
              if (!window.confirm("确定要取消报名吗？")) event.preventDefault();
            }}
          >
            {cancelPending ? "取消中…" : "取消报名"}
          </Button>
        </form>
      ) : (
        <form action={registerAction} className="flex flex-col gap-3">
          <input type="hidden" name="eventId" value={eventId} />
          <FormMessage status={registerState.status} message={registerState.message} />
          {windowOpen ? (
            <Button type="submit" disabled={registerPending} className="self-start">
              {registerPending ? "报名中…" : status ? "重新报名" : "我要报名"}
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm" role="note">
              {windowMessage}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
