import Link from "next/link";

import { StatusBadge } from "@/components/domain/status-badge";
import { judgeApprovalTone, profileStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatePanel } from "@/components/domain/state-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listJudges } from "@/lib/admin/judges";
import {
  JUDGE_APPROVAL_LABELS,
  JUDGE_APPROVAL_STATUSES,
  type JudgeApprovalStatus,
} from "@/lib/domain/judge-eligibility";
import { PROFILE_STATUS_LABELS, type ProfileStatus } from "@/lib/validation/admin";

export const metadata = { title: "裁判审批 · INSPIRA" };

export const dynamic = "force-dynamic";

function parseApprovalStatus(value?: string): JudgeApprovalStatus | undefined {
  return JUDGE_APPROVAL_STATUSES.includes(value as JudgeApprovalStatus)
    ? (value as JudgeApprovalStatus)
    : undefined;
}

export default async function AdminJudgesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; approval?: string }>;
}) {
  const params = await searchParams;
  const approvalStatus = parseApprovalStatus(params.approval);
  const judges = await listJudges({ approvalStatus, search: params.q?.slice(0, 100) });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">裁判审批</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">返回系统管理</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor="q">搜索</Label>
              <Input
                id="q"
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="姓名或邮箱"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approval">审批状态</Label>
              <select
                id="approval"
                name="approval"
                defaultValue={approvalStatus ?? ""}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
              >
                <option value="">全部</option>
                {JUDGE_APPROVAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {JUDGE_APPROVAL_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit">筛选</Button>
            <Button asChild variant="ghost">
              <Link href="/admin/judges">清除</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            共 {judges.length} 位裁判
            {judges.length === 200 ? "（已达上限 200，请用筛选缩小范围）" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {judges.length === 0 ? (
            <StatePanel
              variant="empty"
              title="没有符合条件的裁判"
              description="换一个搜索词，或清除筛选条件。用户注册时选择「裁判」身份，就会出现在这里等待审批。"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  裁判列表，包含姓名、账号状态、审批状态与已获资格的赛制数量
                </caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      姓名
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      账号状态
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      审批状态
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      已获资格赛制
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {judges.map((judge) => {
                    const approvedCount = judge.qualifications.filter((q) => q.approved).length;
                    const assignable =
                      judge.profileStatus === "active" && judge.approvalStatus === "approved";

                    return (
                      <tr
                        key={judge.judgeProfileId}
                        className="border-border border-b last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex flex-col">
                            <span>{judge.displayName}</span>
                            <span className="text-muted-foreground text-xs">{judge.email}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge tone={profileStatusTone(judge.profileStatus)}>
                            {PROFILE_STATUS_LABELS[judge.profileStatus as ProfileStatus] ??
                              judge.profileStatus}
                          </StatusBadge>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col gap-1">
                            <StatusBadge tone={judgeApprovalTone(judge.approvalStatus)}>
                              {JUDGE_APPROVAL_LABELS[judge.approvalStatus] ?? judge.approvalStatus}
                            </StatusBadge>
                            {/*
                              把"能不能被指派"直接写出来。
                              这就是 Phase 5 排赛时会用到的判断，管理员现在就能看懂结果。
                            */}
                            <span className="text-muted-foreground text-xs">
                              {assignable ? "可被指派" : "暂不可被指派"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">{approvedCount} 个</td>
                        <td className="py-3">
                          <Link
                            href={`/admin/judges/${judge.judgeProfileId}`}
                            className="focus-visible:ring-ring/50 rounded underline focus-visible:ring-3"
                          >
                            管理
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
