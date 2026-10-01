import Link from "next/link";
import { notFound } from "next/navigation";

import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { profileStatusTone } from "@/components/domain/status-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfileDetail } from "@/lib/admin/users";
import { AREA_ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import { requireAnyRole } from "@/lib/auth/session";
import { PROFILE_STATUS_LABELS } from "@/lib/validation/admin";

import { RolesForm } from "./roles-form";
import { StatusForm } from "./status-form";

export const metadata = { title: "账号详情 · INSPIRA" };

export const dynamic = "force-dynamic";

/** 把数据库里的英文枚举翻成中文，避免在界面上直接暴露技术值。 */
const JUDGE_APPROVAL_LABELS: Record<string, string> = {
  pending: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
  suspended: "已暂停",
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  // 布局已经要求超管，这里再取一次是为了拿到"我自己是谁"，
  // 用于禁止修改自己的状态。
  const session = await requireAnyRole(AREA_ROLES.admin);
  const { profileId } = await params;

  const profile = await getProfileDetail(profileId);
  if (!profile) notFound();

  const isSelf = profile.id === session.profileId;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{profile.displayName}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/users">返回用户列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">邮箱</dt>
              <dd>{profile.email}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">账号状态</dt>
              <dd>
                <StatusBadge tone={profileStatusTone(profile.status)}>
                  {PROFILE_STATUS_LABELS[profile.status]}
                </StatusBadge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">姓名</dt>
              <dd>
                {profile.lastName}
                {profile.firstName}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">注册时间</dt>
              <dd>{new Date(profile.createdAt).toLocaleString("zh-CN")}</dd>
            </div>
            {profile.studentProfile ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">学生档案</dt>
                <dd>
                  {profile.studentProfile.school ?? "（未填写学校）"}
                  {profile.studentProfile.active ? "" : "（已停用）"}
                </dd>
              </div>
            ) : null}
            {profile.judgeProfile ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">裁判审批状态</dt>
                <dd>
                  {JUDGE_APPROVAL_LABELS[profile.judgeProfile.approvalStatus] ??
                    profile.judgeProfile.approvalStatus}
                </dd>
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5 sm:col-span-2">
              <dt className="text-muted-foreground text-xs">当前角色</dt>
              <dd className="flex flex-wrap gap-1">
                {profile.roles.length === 0 ? (
                  <span className="text-muted-foreground">（无角色）</span>
                ) : (
                  profile.roles.map((role) => <MetaChip key={role}>{ROLE_LABELS[role]}</MetaChip>)
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">账号状态</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusForm
            profileId={profile.id}
            currentStatus={profile.status}
            disabled={isSelf}
            disabledReason="这是你自己的账号，因此不能在这里修改状态。如果确实需要停用，请让另一位超级管理员操作。"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">角色</CardTitle>
        </CardHeader>
        <CardContent>
          <RolesForm profileId={profile.id} currentRoles={profile.roles} />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        ⚠️ 本系统<strong>不做物理删除</strong>。要注销一个账号，请把状态改为「已停用」，
        这样历史记录（报名、评分、审计）会完整保留，账号本身无法再登录。
        匿名化个人信息的流程尚未实现（见 Phase 2 计划）。
      </p>
    </div>
  );
}
