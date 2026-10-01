import Link from "next/link";

import { StatePanel } from "@/components/domain/state-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { getBallotContext } from "@/lib/judge/ballots";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";

import { BallotForm } from "./ballot-form";

export const metadata = { title: "Ballot · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function JudgeBallotPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.judge);
  const { matchId } = await params;

  const context = await getBallotContext(matchId);

  /*
   * 两种"没有内容"要区分开：
   *   - 读不到比赛 → 可能是没被指派（RLS 会隐藏），也可能不存在；
   *   - 读到比赛但没有模板 → 裁判无法打分，必须去看模板配置。
   * 混成一句"找不到"会让裁判以为是自己的问题。
   */
  if (!context) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h2 font-semibold tracking-tight">Ballot</h1>
        <StatePanel
          variant="empty"
          title="Could not open this ballot"
          description="Either this round is not assigned to you, or no ballot template is configured for its format. If you know you are assigned, ask an administrator to configure the template."
        />
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href="/judge">Back to the judge workspace</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Round {context.matchNumber} · {context.roomName}
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/judge">返回裁判区域</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Round information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">Format</p>
            <p>{context.formatCode}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Scheduled start</p>
            <p>
              {utcToZonedLocal(new Date(context.scheduledStart), CLUB_DEFAULT_TIMEZONE).replace(
                "T",
                " ",
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Ballot template</p>
            <p>
              {context.templateName} (version {context.templateVersion})
            </p>
          </div>
        </CardContent>
      </Card>

      {/*
        评分参照表（WSDC / BP 规范明确要求"打分时始终可见"）。
        放在**卡片顶部**而不是填表组件里，是为了它在滚动时不会被字段淹没 ——
        规范说的是"remain visible while judges score speakers"。
      */}
      {context.schema.guidance ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{context.schema.guidance.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {context.schema.guidance.normalRange ? (
              <p>
                Usual range:
                <strong className="ml-1">
                  {context.schema.guidance.normalRange[0]}–{context.schema.guidance.normalRange[1]}
                </strong>
                {context.schema.guidance.defaultScore !== undefined ? (
                  <span className="text-muted-foreground ml-2">
                    (start from {context.schema.guidance.defaultScore})
                  </span>
                ) : null}
              </p>
            ) : null}

            <div className="flex flex-col gap-1">
              {context.schema.guidance.anchors.map((anchor) => (
                <div key={anchor.score} className="flex flex-wrap items-baseline gap-2">
                  <strong className="w-10 tabular-nums">{anchor.score}</strong>
                  <span className="w-40">{anchor.label}</span>
                  {anchor.note ? (
                    <span className="text-muted-foreground text-xs">{anchor.note}</span>
                  ) : null}
                </div>
              ))}
            </div>

            {/*
              参照表里**没有**列出的中间分数怎么处理，规范没有说。
              不写这一句的话，裁判会以为只有列出的那几个分数能用。
            */}
            <p className="text-muted-foreground text-xs">
              Scores not listed here are still allowed. The reference is there to calibrate everyone
              to the same scale, not to list every score you may give.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ballot</CardTitle>
        </CardHeader>
        <CardContent>
          <BallotForm context={context} />
        </CardContent>
      </Card>
    </div>
  );
}
