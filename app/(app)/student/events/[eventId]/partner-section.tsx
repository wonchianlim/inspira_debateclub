"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import {
  cancelPartnerRequestAction,
  respondToPartnerRequestAction,
  sendPartnerRequestAction,
} from "@/lib/student/partner-actions";
import type { PartnerRequestView } from "@/lib/student/partners";
import { PARTNER_IS_PREFERENCE_NOT_GUARANTEE } from "@/lib/validation/partners";

const STATUS_LABELS: Record<PartnerRequestView["status"], string> = {
  pending: "等待对方回应",
  accepted: "已接受",
  unavailable: "对方无法搭档",
  replaced: "已被替换",
  cancelled: "已撤回",
};

/** 收到的一条请求：接受 / 拒绝。 */
function IncomingRequest({ request }: { request: PartnerRequestView }) {
  const [state, formAction, pending] = useActionState(
    respondToPartnerRequestAction,
    INITIAL_FORM_STATE,
  );

  const isPending = request.status === "pending";

  return (
    <li className="border-border flex flex-col gap-2 border-b py-3 last:border-0">
      <div className="text-sm">
        <strong>{request.counterpartName}</strong>
        {request.counterpartSchool ? (
          <span className="text-muted-foreground"> · {request.counterpartSchool}</span>
        ) : null}
        <span className="text-muted-foreground"> 邀请你搭档</span>
        <span className="text-muted-foreground ml-2 text-xs">{STATUS_LABELS[request.status]}</span>
      </div>

      {isPending ? (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="requestId" value={request.id} />
          <FormMessage status={state.status} message={state.message} />
          <Button type="submit" name="decision" value="accepted" size="sm" disabled={pending}>
            接受
          </Button>
          <Button
            type="submit"
            name="decision"
            value="unavailable"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            这次不行
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/** 我发出的请求：撤回。 */
function OutgoingRequest({ request }: { request: PartnerRequestView }) {
  const [state, formAction, pending] = useActionState(
    cancelPartnerRequestAction,
    INITIAL_FORM_STATE,
  );
  const isPending = request.status === "pending";

  return (
    <li className="border-border flex flex-col gap-2 border-b py-3 last:border-0">
      <div className="text-sm">
        <span className="text-muted-foreground">你邀请了 </span>
        <strong>{request.counterpartName}</strong>
        {request.counterpartSchool ? (
          <span className="text-muted-foreground"> · {request.counterpartSchool}</span>
        ) : null}
        <span className="text-muted-foreground ml-2 text-xs">{STATUS_LABELS[request.status]}</span>
      </div>

      {isPending ? (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="requestId" value={request.id} />
          <FormMessage status={state.status} message={state.message} />
          <Button type="submit" size="sm" variant="ghost" disabled={pending} className="self-start">
            撤回邀请
          </Button>
        </form>
      ) : null}
    </li>
  );
}

export function PartnerSection({
  eventId,
  myPartnerCode,
  requests,
  canInvite,
  cannotInviteReason,
}: {
  eventId: string;
  myPartnerCode: string | null;
  requests: PartnerRequestView[];
  canInvite: boolean;
  cannotInviteReason?: string;
}) {
  const [state, formAction, pending] = useActionState(sendPartnerRequestAction, INITIAL_FORM_STATE);

  const incoming = requests.filter((request) => request.direction === "incoming");
  const outgoing = requests.filter((request) => request.direction === "outgoing");

  return (
    <div className="flex flex-col gap-5">
      <div className="border-border rounded-md border px-3 py-3">
        <p className="text-sm font-medium">我的搭档码</p>
        {myPartnerCode ? (
          <>
            <p className="mt-1 font-mono text-lg tracking-widest">{myPartnerCode}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              把这个码发给想搭档的同学即可，不需要给别人你的邮箱或电话。
              <strong>只有拿到这个码的人才能找到你</strong>，系统里没有可以浏览的同学名单。
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">
            你的账号还不是学生账号，因此没有搭档码。
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="partnerCode">用搭档码邀请同学</Label>
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="eventId" value={eventId} />
          <Input
            id="partnerCode"
            name="partnerCode"
            placeholder="例如 JX4GXKDGUS"
            disabled={!canInvite || pending}
            className="max-w-56 font-mono uppercase"
            aria-describedby="partner-code-hint"
          />
          <Button type="submit" disabled={!canInvite || pending}>
            {pending ? "邀请中…" : "发出邀请"}
          </Button>
        </form>
        <p id="partner-code-hint" className="text-muted-foreground text-xs">
          {canInvite
            ? "对方必须也报名了本活动。你只能看到对方的姓名与学校。"
            : (cannotInviteReason ?? "报名之后才能邀请搭档。")}
        </p>
        <FormMessage status={state.status} message={state.message} />
      </div>

      <p className="text-muted-foreground text-xs">{PARTNER_IS_PREFERENCE_NOT_GUARANTEE}</p>

      {incoming.length > 0 ? (
        <div>
          <p className="mb-1 text-sm font-medium">收到的邀请</p>
          <ul className="flex flex-col">
            {incoming.map((request) => (
              <IncomingRequest key={request.id} request={request} />
            ))}
          </ul>
        </div>
      ) : null}

      {outgoing.length > 0 ? (
        <div>
          <p className="mb-1 text-sm font-medium">我发出的邀请</p>
          <ul className="flex flex-col">
            {outgoing.map((request) => (
              <OutgoingRequest key={request.id} request={request} />
            ))}
          </ul>
        </div>
      ) : null}

      {requests.length === 0 ? (
        <p className="text-muted-foreground text-sm">本活动还没有搭档邀请记录。</p>
      ) : null}
    </div>
  );
}
