import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJudgeDetail } from "@/lib/admin/judges";
import { listAllFormats } from "@/lib/admin/formats";
import { JUDGE_APPROVAL_LABELS, eligibleFormatIds } from "@/lib/domain/judge-eligibility";
import { requireAnyRole } from "@/lib/auth/session";
import { AREA_ROLES } from "@/lib/auth/roles";
import { PROFILE_STATUS_LABELS } from "@/lib/validation/admin";

import { ApprovalForm } from "./approval-form";
import { NotesForm } from "./notes-form";
import { QualificationsForm } from "./qualifications-form";

export const metadata = { title: "裁判详情 · INSPIRA" };

export const dynamic = "force-dynamic";

export default async function AdminJudgeDetailPage({
  params,
}: {
  params: Promise<{ judgeId: string }>;
}) {
  await requireAnyRole(AREA_ROLES.admin);
  const { judgeId } = await params;

  const [judge, formats] = await Promise.all([getJudgeDetail(judgeId), listAllFormats()]);
  if (!judge) notFound();

  const eligibleIds = eligibleFormatIds({
    profileStatus: judge.profileStatus,
    approvalStatus: judge.approvalStatus,
    qualifications: judge.qualifications,
  });
  const eligibleCodes = formats
    .filter((format) => eligibleIds.includes(format.id))
    .map((format) => format.code);

  const isApproved = judge.approvalStatus === "approved";
  const accountActive = judge.profileStatus === "active";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{judge.displayName}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/judges">返回裁判列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前状态</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">邮箱</dt>
              <dd>{judge.email}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">账号状态</dt>
              <dd>
                <Badge variant={accountActive ? "secondary" : "destructive"}>
                  {PROFILE_STATUS_LABELS[judge.profileStatus] ?? judge.profileStatus}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">审批状态</dt>
              <dd>
                <Badge variant={isApproved ? "secondary" : "outline"}>
                  {JUDGE_APPROVAL_LABELS[judge.approvalStatus] ?? judge.approvalStatus}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">可被指派的赛制</dt>
              <dd>
                {eligibleCodes.length === 0 ? (
                  <span className="text-muted-foreground">暂无</span>
                ) : (
                  eligibleCodes.join("、")
                )}
              </dd>
            </div>
          </dl>

          {/*
            把判定结果直接解释给管理员，而不是只给状态标签。
            "未批准 + 有资格" 这种情况最容易让人困惑：资格有了，为什么还不能排？
          */}
          {!accountActive ? (
            <p className="text-destructive mt-4 text-xs" role="note">
              该裁判的账号不是「正常」状态，因此即使审批通过也不能被指派。
            </p>
          ) : !isApproved ? (
            <p className="text-muted-foreground mt-4 text-xs" role="note">
              当前审批状态是「{JUDGE_APPROVAL_LABELS[judge.approvalStatus]}」，
              把状态改为「已批准」后，这位裁判才能被指派到下面已勾选的赛制。
            </p>
          ) : eligibleCodes.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-xs" role="note">
              已批准，但还没有任何赛制资格，因此暂时不能被指派到任何比赛。请在下方勾选其获资格的赛制。
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">审批状态</CardTitle>
        </CardHeader>
        <CardContent>
          <ApprovalForm
            judgeProfileId={judge.judgeProfileId}
            currentStatus={judge.approvalStatus}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">赛制资格</CardTitle>
        </CardHeader>
        <CardContent>
          <QualificationsForm
            judgeProfileId={judge.judgeProfileId}
            formats={formats}
            approvedFormatIds={judge.qualifications
              .filter((entry) => entry.approved)
              .map((entry) => entry.formatId)}
            disabled={!isApproved}
            disabledReason="审批状态不是「已批准」时不能授予赛制资格。请先在上方把状态改为「已批准」。"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">裁判范式与备注</CardTitle>
        </CardHeader>
        <CardContent>
          <NotesForm
            judgeProfileId={judge.judgeProfileId}
            paradigm={judge.paradigm}
            experienceNotes={judge.experienceNotes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
