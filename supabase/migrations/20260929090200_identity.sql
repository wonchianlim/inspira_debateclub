-- =============================================================================
-- 20260929090200_identity.sql
--
-- 身份与角色（第 6.1 节）。
--
-- 包含：profiles、user_roles、student_profiles、judge_profiles
--      以及角色判断辅助函数与若干保护性触发器。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
--
-- id 直接等于认证服务的用户 UUID（见 ADR-0001），这样权限策略可以直接写
-- "这一行属于当前用户"，不需要额外的连接。
--
-- ON DELETE 行为：**不设级联**。按 docs/schema.md 的 S-16，不活跃账号采用
-- "停用 + 匿名化"而不是物理删除；默认的 NO ACTION 会让"删除认证用户"被拒绝，
-- 从而避免误删历史。这与第 6 章"历史/运营数据用 RESTRICT"的要求一致。
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id),
  first_name text not null,
  last_name text not null,
  display_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  '用户档案。id 与认证服务用户 UUID 相同，便于权限策略直接以 auth.uid() 判断。';
comment on column public.profiles.status is
  'active/inactive/suspended。只能由超级管理员修改，见 prevent_profile_status_change 触发器。';
comment on column public.profiles.email is
  '与认证服务的邮箱重复存放，便于展示；以认证服务为准。';

-- -----------------------------------------------------------------------------
-- user_roles
--
-- 一个账号可有多个角色，因此是关联表（AGENTS.md 硬性规则：绝不使用单一 role 字段）。
-- 该表是只追加的关联：没有 updated_at（第 6.1 节未列出）。
-- -----------------------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  role public.app_role not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (profile_id, role)
);

comment on table public.user_roles is
  '角色授予记录。(profile_id, role) 唯一，防止重复授予同一角色。';

-- -----------------------------------------------------------------------------
-- student_profiles
--
-- 注意：**不**在此存放辩论评分。评分是按赛制的，见 student_format_profiles。
-- -----------------------------------------------------------------------------
create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id),
  school text,
  grade text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.student_profiles.notes is
  '运营备注。按 docs/schema.md D-8 的确认：仅管理员可见（见 RLS 策略）。';

-- -----------------------------------------------------------------------------
-- judge_profiles
-- -----------------------------------------------------------------------------
create table public.judge_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id),
  approval_status public.judge_approval_status not null default 'pending',
  paradigm text,
  experience_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.judge_profiles.approval_status is
  '裁判必须经批准才能被指派。只能由超级管理员修改，见 prevent_judge_approval_change 触发器。';

-- =============================================================================
-- 每次 UPDATE 自动维护 updated_at
-- =============================================================================
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger student_profiles_set_updated_at
  before update on public.student_profiles
  for each row execute function public.set_updated_at();

create trigger judge_profiles_set_updated_at
  before update on public.judge_profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 角色判断辅助函数
--
-- ⚠️ 全部使用 SECURITY DEFINER + 固定 search_path = ''。
--
-- 原因（docs/schema.md S-5）：如果以普通权限读取 user_roles，而 user_roles 自身
-- 启用了 RLS，策略里再调用这些函数就会造成 RLS **无限递归**，所有查询直接报错。
-- 这是 Supabase 项目最常见的严重故障之一。
--
-- 固定 search_path = '' 是为了防止 search_path 劫持：函数内所有对象都必须
-- 写全 schema 前缀。
--
-- 同时每个函数都必须**自己正确限定范围**（只查当前用户），不能返回过宽的结果。
-- =============================================================================

-- 是否拥有指定角色
create or replace function public.has_role(target public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where profile_id = auth.uid()
      and role = target
  );
$$;

comment on function public.has_role(public.app_role) is
  '当前登录用户是否拥有指定角色。SECURITY DEFINER 以避免 user_roles 的 RLS 递归。';

-- 是否以 service_role 身份运行（service-role key 调用，绕过 RLS）
--
-- 用途：保护性触发器需要放行系统级操作（例如初始化脚本、后台任务），
-- 因为它们没有登录用户，auth.uid() 为空。
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

comment on function public.is_service_role() is
  '当前请求是否以 service_role 身份执行。用于让保护性触发器放行系统级操作。';

-- 是否超级管理员
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('super_admin'::public.app_role);
$$;

-- 是否俱乐部管理员或超级管理员（可管理事件与运营数据）
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('club_manager'::public.app_role)
      or public.has_role('super_admin'::public.app_role);
$$;

-- 是否是"员工"（教练 / 俱乐部管理员 / 超级管理员）
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('coach'::public.app_role)
      or public.has_role('club_manager'::public.app_role)
      or public.has_role('super_admin'::public.app_role);
$$;

-- 是否学生 / 是否裁判
create or replace function public.is_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('student'::public.app_role);
$$;

create or replace function public.is_judge()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('judge'::public.app_role);
$$;

-- 当前用户的 student_profiles.id / judge_profiles.id（没有则返回 null）
create or replace function public.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.student_profiles where profile_id = auth.uid();
$$;

create or replace function public.my_judge_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.judge_profiles where profile_id = auth.uid();
$$;

-- =============================================================================
-- 保护性触发器
--
-- 为什么需要它们：RLS 只能控制"能不能改这一行"，**无法只限制某几个列**。
-- 如果策略允许用户更新自己的 profiles 行，他就能顺手把自己的 status 改掉。
-- 因此必须用触发器把这类列单独保护起来。
-- （docs/permissions.md 第 4.1 节，以及拒绝用例 F-STU-08。）
-- =============================================================================

create or replace function public.prevent_profile_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not (public.is_super_admin() or public.is_service_role()) then
      raise exception '只有超级管理员可以修改账号状态'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.prevent_profile_status_change() is
  '阻止非超级管理员修改 profiles.status。RLS 无法只限制单个列，故用触发器。';

create trigger profiles_prevent_status_change
  before update on public.profiles
  for each row execute function public.prevent_profile_status_change();

create or replace function public.prevent_judge_approval_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.approval_status is distinct from old.approval_status then
    if not (public.is_super_admin() or public.is_service_role()) then
      raise exception '只有超级管理员可以修改裁判的审批状态'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger judge_profiles_prevent_approval_change
  before update on public.judge_profiles
  for each row execute function public.prevent_judge_approval_change();

-- =============================================================================
-- 新认证用户 → 自动建立 profiles 行
--
-- 职责划分（刻意保持最小）：
--   本触发器**只**保证每个认证用户都有对应的 profiles 行。
--   这样任何权限策略都不会遇到"查不到自己的档案"这种边界情况。
--
--   而"授予哪个角色""是否同时建立 student_profiles / judge_profiles"属于注册流程的
--   业务决定，由 P1-8 的注册 Server Action 负责（它使用 service_role 完成初始授权，
--   这正是 docs/architecture.md 第 7.3 节列出的允许用途之一）。
--
--   这样做的原因：角色的默认值是产品决策（PERM-D-1 已确认为 student），但
--   "学生还是裁判"取决于注册表单收集到的意图，不应硬编码在数据库触发器里。
-- =============================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.email, ''),
      '未命名用户'
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  '认证用户创建时自动建立 profiles 行。角色授予由注册流程负责（见文件末尾说明）。';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
