-- =============================================================================
-- 20260929090400_qualifications.sql
--
-- 按赛制的学生资格与评分、裁判资格（第 6.2 节）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- student_format_profiles
--
-- 关键设计（第 2.4 节）：资格与评分是**按赛制**的，不是学生的一个全局属性。
-- 评分为 1–10。评分在建立 participation 时会被快照，以免后续修改改写历史。
-- -----------------------------------------------------------------------------
create table public.student_format_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles (id),
  format_id uuid not null references public.debate_formats (id),
  eligible boolean not null default false,
  rating smallint check (rating between 1 and 10),
  updated_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, format_id),
  -- 第 6.2 节：标记为合格就必须有评分。否则配对算法会拿到"合格但没有能力值"的学生。
  constraint student_format_profiles_eligible_needs_rating
    check ((eligible = false) or (rating is not null))
);

comment on table public.student_format_profiles is
  '学生在各赛制下的资格与 1–10 能力评分。评分在创建 participation 时快照。';
comment on column public.student_format_profiles.updated_by is
  '最后一次修改这条资格/评分的操作者，用于追责与审计。';

create trigger student_format_profiles_set_updated_at
  before update on public.student_format_profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- judge_format_qualifications
-- -----------------------------------------------------------------------------
create table public.judge_format_qualifications (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid not null references public.judge_profiles (id),
  format_id uuid not null references public.debate_formats (id),
  approved boolean not null default false,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (judge_id, format_id)
);

comment on table public.judge_format_qualifications is
  '裁判在哪些赛制下已获批准。未获批的赛制不得被指派（第 11 节）。';

create trigger judge_format_qualifications_set_updated_at
  before update on public.judge_format_qualifications
  for each row execute function public.set_updated_at();
