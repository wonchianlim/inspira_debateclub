"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/domain/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMatchSettingsAction } from "@/lib/admin/event-actions";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";

/**
 * 比赛设置：第一场开始时间、每场间隔、房间列表。
 *
 * 产品负责人明确要求"希望比赛时间和房间能自己设置"，
 * 因此这三项从代码里的默认值改成活动级配置。
 *
 * 房间用**多行文本框、一行一个**，而不是动态增删的输入框组：
 * 管理员通常是从别处（通知、聊天记录）把房间号整段粘进来，
 * 逐行粘贴比逐个点"添加"快得多，也不需要键盘之外的精确操作。
 */
export function MatchSettingsForm({
  eventId,
  timezone,
  matchStartAtLocal,
  matchIntervalMinutes,
  roomNames,
}: {
  eventId: string;
  timezone: string;
  matchStartAtLocal: string;
  matchIntervalMinutes: number;
  roomNames: string[];
}) {
  const [state, formAction, pending] = useActionState(
    updateMatchSettingsAction,
    INITIAL_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="matchStartAtLocal">第一场比赛开始时间（{timezone}）</Label>
        <Input
          id="matchStartAtLocal"
          name="matchStartAtLocal"
          type="datetime-local"
          defaultValue={matchStartAtLocal}
          disabled={pending}
          className="max-w-72"
        />
        <p className="text-muted-foreground text-xs">
          留空表示沿用活动的开始时间。这就是加入本设置之前的行为。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="matchIntervalMinutes">每场比赛之间间隔多少分钟</Label>
        <Input
          id="matchIntervalMinutes"
          name="matchIntervalMinutes"
          type="number"
          min={5}
          max={600}
          defaultValue={matchIntervalMinutes}
          disabled={pending}
          className="max-w-32"
        />
        <p className="text-muted-foreground text-xs">5 到 600 分钟之间。默认 60。</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="roomNamesText">可用房间（一行一个）</Label>
        <textarea
          id="roomNamesText"
          name="roomNamesText"
          rows={5}
          defaultValue={roomNames.join("\n")}
          disabled={pending}
          placeholder={"A101\nA102\nB201"}
          className="border-input bg-background max-w-72 rounded-md border px-3 py-2 font-mono text-sm"
        />
        <p className="text-muted-foreground text-xs">
          按这里的顺序依次分配。留空则沿用默认（从 A101 开始）。重复的房间名会自动去掉一个。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "保存中…" : "保存比赛设置"}
        </Button>
        <p className="text-muted-foreground text-xs">
          这里只影响**以后重新生成**的比赛。已经排好的比赛不会自动改变。
        </p>
      </div>
    </form>
  );
}
