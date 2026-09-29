-- =============================================================================
-- 20260929091100_ops.sql
--
-- 审计与系统设置（第 6.7 节，以及 docs/schema.md 的 S-7）。
--
-- 编号刻意留出 090700–091000 的空档，供后续阶段使用：
--   participation_teams（Phase 4）、matches（Phase 5）、judges（Phase 5）、ballots（Phase 7）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit_logs
--
-- 只追加。任何应用角色都不得 UPDATE / DELETE（第 6.7 节、第 7 节）。
-- 强制手段有三重，缺一不可：
--   1. 不创建任何 UPDATE / DELETE 的 RLS 策略（见 RLS 迁移）；
--   2. 显式 REVOKE UPDATE / DELETE / TRUNCATE（见 RLS 迁移）；
--   3. 客户端角色没有 INSERT 权限，只通过 SECURITY DEFINER 函数写入。
--
-- 只有 created_at，没有 updated_at —— 因为它是只追加表（第 6 章明确说
-- "除非明确为只追加"）。
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- 操作者被删除时置空，而不是让删除被阻止、也不是级联删掉审计记录（docs/schema.md S-16）
  actor_profile_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  '只追加的审计日志。任何应用角色不得修改或删除；特权改动必须在此留痕。';
comment on column public.audit_logs.request_id is
  '把一次用户操作产生的多条审计记录与请求日志串联起来，便于事后追查。';
comment on column public.audit_logs.entity_id is
  '被操作实体的 id。刻意不加外键，因为 entity_type 是多态的，加外键会限制可记录的实体范围。';

-- -----------------------------------------------------------------------------
-- system_settings（docs/schema.md S-7 新增）
--
-- 为什么需要：第 3.5 节列出超级管理员可"管理系统设置"，第 8 章有 /admin/settings
-- 路由，但第 6 章没有任何承载这些设置的表——设置将无处存放。
--
-- 用途：把第 17 节待确认的时间参数（报名提前量、预警提前量、提醒时间表）
-- 放进数据而不是写死在代码里，管理员才能自行调整。
-- -----------------------------------------------------------------------------
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.system_settings is
  '系统级设置（键值对）。仅超级管理员可读写；默认不向学生公开任何项（PERM-D-5 已确认）。';

create trigger system_settings_set_updated_at
  before update on public.system_settings
  for each row execute function public.set_updated_at();
