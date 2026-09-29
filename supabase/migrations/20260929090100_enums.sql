-- =============================================================================
-- 20260929090100_enums.sql
--
-- 枚举类型。
--
-- 第 6 章的要求："PostgreSQL 枚举只用于**稳定的工作流状态**；会增长的概念
-- 用查找表或受检查的文本。"
--
-- 本迁移只创建 Phase 1 实际用到的枚举。后续阶段会用到但当前还没有表的枚举
-- （partner_request_status、entitlement_type、participation_status、team_status、
-- match_status、judge_availability_status、judge_assignment_role、
-- judge_assignment_status、ballot_status、review_request_status、email_job_status）
-- 留到创建对应表的迁移中再建，避免提前实现后续阶段。
-- =============================================================================

-- 档案状态（第 6.1 节）
create type public.profile_status as enum ('active', 'inactive', 'suspended');

-- 应用角色（第 2.11 节）。一个账号可拥有多个角色，因此角色存放在关联表，
-- 而**不是** profiles 上的一个字段（AGENTS.md 硬性规则）。
create type public.app_role as enum ('student', 'judge', 'coach', 'club_manager', 'super_admin');

-- 裁判审批状态（第 6.1 节）
create type public.judge_approval_status as enum ('pending', 'approved', 'rejected', 'suspended');

-- 事件生命周期（第 6.3 节、第 9.1 节）
create type public.event_status as enum (
  'draft',
  'registration_open',
  'registration_closed',
  'pairing',
  'ready',
  'live',
  'completed',
  'archived',
  'cancelled'
);

-- 报名状态（第 6.3 节）。注意 late_cancelled 与 cancelled 是两种不同的事实，
-- 关系到"迟到取消"的统计，不能合并。
create type public.registration_status as enum (
  'registered',
  'cancelled',
  'late_cancelled',
  'checked_in',
  'no_show'
);

-- 签到方式（第 6.3 节）：学生自助签到，或管理员代为签到
create type public.check_in_method as enum ('self', 'admin');
