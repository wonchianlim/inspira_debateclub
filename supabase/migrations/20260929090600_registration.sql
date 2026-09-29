-- =============================================================================
-- 20260929090600_registration.sql
--
-- 报名与赛制偏好（第 6.3 节）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- registrations
--
-- ⚠️ 关于 UNIQUE (event_id, student_id) 与"取消后重新报名"（docs/schema.md S-1）：
--
-- 唯一约束**必须保留**——它是防止真正重复报名的最后防线。
-- 因此"取消后重新报名"不能插入第二行，而是把原行的 status 改回 registered、
-- 并把 cancelled_at 置空。
--
-- 代价：late_cancelled 这一历史事实会被状态回退覆盖。因此迟到取消的统计
-- **不能**只依赖当前 status，必须查 audit_logs（第 6.7 节要求审计特权改动）。
-- 这正是 docs/schema.md D-1（已确认）所选择的方案。
-- -----------------------------------------------------------------------------
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  student_id uuid not null references public.student_profiles (id),
  status public.registration_status not null default 'registered',
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  check_in_method public.check_in_method,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, student_id)
);

comment on table public.registrations is
  '学生对某次活动的报名。每个 (event_id, student_id) 至多一行；重新报名是状态回退，不是新增行（S-1）。';
comment on column public.registrations.status is
  'registered/cancelled/late_cancelled/checked_in/no_show。迟到取消的完整历史在 audit_logs 中。';

create trigger registrations_set_updated_at
  before update on public.registrations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- registration_format_preferences
--
-- 学生报名时对赛制的偏好排序。只能选择"该事件已启用 **且** 该学生合格"的赛制——
-- 这条规则在服务端与 RLS 两侧执行（第 6.3 节）。
-- -----------------------------------------------------------------------------
create table public.registration_format_preferences (
  id uuid primary key default gen_random_uuid(),
  -- 报名被删除时，其偏好也应一并删除，因此这里用 CASCADE（第 6.3 节明确允许）
  registration_id uuid not null references public.registrations (id) on delete cascade,
  format_id uuid not null references public.debate_formats (id),
  preference_rank smallint not null check (preference_rank > 0),
  created_at timestamptz not null default now(),
  unique (registration_id, format_id),
  unique (registration_id, preference_rank)
);

comment on table public.registration_format_preferences is
  '赛制偏好排序。(registration_id, preference_rank) 唯一，防止出现两个"第一志愿"。';
