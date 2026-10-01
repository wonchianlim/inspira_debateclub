import Link from "next/link";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatePanel } from "@/components/domain/state-panel";
import { StatusBadge } from "@/components/domain/status-badge";
import { judgeApprovalTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ROLES } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { summarizeJudgeHistory } from "@/lib/domain/judge-history";
import { getMyJudgeProfile, listMyJudgeHistory } from "@/lib/judge/profile";

import { JudgeProfileForm } from "./profile-form";

export const metadata = { title: "我的裁判档案 · INSPIRA" };
export const dynamic = "force-dynamic";

const APPROVAL_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "未通过",
  suspended: "已暂停",
};

export default async function JudgeProfilePage() {
  await requireAnyRole(AREA_ROLES.judge);

  const profile = await getMyJudgeProfile();
  if (!profile) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold tracking-tight">我的裁判档案</h1>
        <StatePanel
          variant="empty"
          title="你的账号还没有裁判档案"
          description="请联系管理员为你建立裁判档案，之后你就能填写执裁理念并接受指派。"
        />
      </div>
    );
  }

  const history = summarizeJudgeHistory(await listMyJudgeHistory());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">我的裁判档案</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/judge">返回裁判区域</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">审核状态与可执裁赛制</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span>
            状态
            <StatusBadge tone={judgeApprovalTone(profile.approvalStatus)} className="ml-2">
              {APPROVAL_LABELS[profile.approvalStatus] ?? profile.approvalStatus}
            </StatusBadge>
          </span>
          <span className="flex items-center gap-2">
            可执裁
            {profile.qualifiedFormats.length === 0 ? (
              <span className="text-muted-foreground">（暂未取得任何赛制资格）</span>
            ) : (
              profile.qualifiedFormats.map((code) => <MetaChip key={code}>{code}</MetaChip>)
            )}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">我的执裁记录</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <span>
              被指派
              <strong className="ml-1">{history.assigned}</strong>
            </span>
            <span>
              已交回
              <strong className="ml-1">{history.completed}</strong>
            </span>
            {history.outstanding > 0 ? <span>{history.outstanding} 场还没交</span> : null}
            {history.completionRate !== null ? (
              <span className="text-muted-foreground">交表率 {history.completionRate}%</span>
            ) : null}
          </div>

          {history.byFormat.length > 0 ? (
            <div className="flex flex-wrap gap-x-6">
              {history.byFormat.map((group) => (
                <span key={group.formatCode}>
                  {group.formatCode}
                  <strong className="ml-1">{group.completed}</strong>
                  <span className="text-muted-foreground ml-1 text-xs">场</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">还没有交回过任何评分表。</p>
          )}

          {history.averageScoreGiven !== null ? (
            <p>
              你给出的平均分
              <strong className="ml-1">{history.averageScoreGiven}</strong>
              <span className="text-muted-foreground ml-2 text-xs">
                （仅你自己可见 —— 规范要的是裁判之间**尺度一致**，不是把你和别人比）
              </span>
            </p>
          ) : null}

          {history.averageReasonLength !== null ? (
            <p>
              判决理由平均长度
              <strong className="ml-1">{history.averageReasonLength}</strong>
              <span className="text-muted-foreground ml-1 text-xs">字</span>
              {history.averageReasonLength < 100 ? (
                <span className="text-muted-foreground ml-2 text-xs">
                  （规范建议至少 100 字 —— 太短的话学生看不懂结果）
                </span>
              ) : null}
            </p>
          ) : null}

          {/*
            重开次数**只陈述、不解读**。
            重开也可能是管理员搞错了，把它当成"这位裁判有问题"是不公平的。
          */}
          {history.reopenedCount > 0 ? (
            <p className="text-muted-foreground text-xs">
              有 {history.reopenedCount} 场被管理员重开过。重开只是流程，不一定说明评分有问题。
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">我的执裁理念与经验</CardTitle>
        </CardHeader>
        <CardContent>
          <JudgeProfileForm paradigm={profile.paradigm} experienceNotes={profile.experienceNotes} />
        </CardContent>
      </Card>
    </div>
  );
}
