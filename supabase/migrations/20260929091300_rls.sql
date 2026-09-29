-- =============================================================================
-- 20260929091300_rls.sql
--
-- 行级安全（RLS）与权限策略。
--
-- 依据：主规格第 7 节（RLS 与安全要求）、第 4 节（权限矩阵），
--       以及 docs/permissions.md 的逐表策略计划。
--
-- 核心原则：**默认拒绝**。启用 RLS 后，没有策略就等于没有权限。
-- 因此下面为每张表**显式**写出允许的操作；未写出的操作一律被拒绝。
--
-- ⚠️ RLS 只是第一层。第二层是服务端的 requireCapability() 检查
--    （见 docs/architecture.md 第 6 节）。两层都必不可少：
--    RLS 是最后防线，服务端检查负责给出友好的错误信息。
-- =============================================================================

-- =============================================================================
-- 一、策略用到的辅助函数
--
-- 全部 SECURITY DEFINER + 固定 search_path：它们需要读取受 RLS 保护的表
-- （events、registrations），如果以调用者权限读取就会触发递归或权限不足。
-- =============================================================================

-- 某个活动当前是否处于"可报名"的时间窗口内
--
-- 注意：判断依据是**时间戳**，而不只是 status（第 9.2 节明确要求：
-- "报名即使定时任务没跑，也按时间戳自动关闭"）。
create or replace function public.is_event_registration_open(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event
      and e.status not in ('draft', 'cancelled', 'archived', 'completed')
      and now() >= e.registration_opens_at
      and now() < e.registration_closes_at
  );
$$;

comment on function public.is_event_registration_open(uuid) is
  '该活动此刻是否处于可报名窗口内。以时间戳判断，保证无需定时任务也能自动关闭。';

-- 某条报名是否属于当前登录学生
create or replace function public.is_my_registration(target_registration uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.registrations r
    where r.id = target_registration
      and r.student_id = public.my_student_id()
  );
$$;

-- 某条报名的活动此刻是否可报名（用于报名偏好的写权限）
create or replace function public.is_my_registration_open(target_registration uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.registrations r
    where r.id = target_registration
      and r.student_id = public.my_student_id()
      and public.is_event_registration_open(r.event_id)
  );
$$;

-- =============================================================================
-- 二、学生档案的运营字段保护
--
-- RLS 无法只限制单个列。学生可以更新自己的 school/grade，但**不得**修改
-- notes（运营备注，PERM-D-8 确认仅管理员可见）与 active。
-- =============================================================================
create or replace function public.prevent_student_profile_operational_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.notes is distinct from old.notes or new.active is distinct from old.active then
    if not (public.is_manager() or public.is_service_role()) then
      raise exception '只有管理员可以修改学生的运营备注或启用状态'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger student_profiles_prevent_operational_change
  before update on public.student_profiles
  for each row execute function public.prevent_student_profile_operational_change();

-- =============================================================================
-- 三、启用 RLS（默认拒绝）
-- =============================================================================
alter table public.profiles                        enable row level security;
alter table public.user_roles                      enable row level security;
alter table public.student_profiles                enable row level security;
alter table public.judge_profiles                  enable row level security;
alter table public.debate_formats                  enable row level security;
alter table public.format_positions                enable row level security;
alter table public.student_format_profiles         enable row level security;
alter table public.judge_format_qualifications     enable row level security;
alter table public.events                          enable row level security;
alter table public.event_formats                   enable row level security;
alter table public.registrations                   enable row level security;
alter table public.registration_format_preferences enable row level security;
alter table public.audit_logs                      enable row level security;
alter table public.system_settings                 enable row level security;

-- =============================================================================
-- 四、表权限
--
-- RLS 决定"哪些行"，GRANT 决定"哪些操作"。两者都必须到位。
-- 这里只把权限授予 authenticated 与 service_role；**anon（未登录）不授予任何表权限**。
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- =============================================================================
-- 五、策略
-- =============================================================================

-- ------------------------------------------------------------------ profiles
-- 自己可读；员工（教练/管理员/超管）可读学生档案。
-- 学生**不能**读其他学生的私人档案（第 3.1 节）。
create policy profiles_select_own_or_staff on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_manager on public.profiles
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- 刻意**不**创建 INSERT 策略：profiles 行由 handle_new_auth_user 触发器创建。
-- 刻意**不**创建 DELETE 策略：按 S-16 采用停用而非物理删除。

-- ---------------------------------------------------------------- user_roles
create policy user_roles_select_own_or_manager on public.user_roles
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_manager());

-- 只有超级管理员可以授予/撤销角色（第 4 节矩阵："Grant administrative roles" 仅超管）
create policy user_roles_write_super_admin on public.user_roles
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ----------------------------------------------------------- student_profiles
create policy student_profiles_select_own_or_staff on public.student_profiles
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_staff());

create policy student_profiles_update_own on public.student_profiles
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy student_profiles_manage on public.student_profiles
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ------------------------------------------------------------- judge_profiles
create policy judge_profiles_select_own_or_staff on public.judge_profiles
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_staff());

-- 裁判可维护自己的 paradigm 与经验说明；approval_status 由触发器单独保护
create policy judge_profiles_update_own on public.judge_profiles
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy judge_profiles_manage on public.judge_profiles
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ------------------------------------------------------- debate_formats / 位置
-- 所有已登录用户可读（下拉框需要）；只有超管可改（第 4 节矩阵）
create policy debate_formats_select_all on public.debate_formats
  for select to authenticated using (true);

create policy debate_formats_admin on public.debate_formats
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy format_positions_select_all on public.format_positions
  for select to authenticated using (true);

create policy format_positions_admin on public.format_positions
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ------------------------------------------------- student_format_profiles
-- 学生只能读自己的资格与评分（拒绝用例 F-STU-02）；教练可读（PERM-D-3）
create policy student_format_profiles_select_own_or_staff on public.student_format_profiles
  for select to authenticated
  using (student_id = public.my_student_id() or public.is_staff());

-- 写权限仅管理角色。教练按 PERM-D-2 确认为**只读**。
create policy student_format_profiles_manage on public.student_format_profiles
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ------------------------------------------- judge_format_qualifications
create policy judge_format_qualifications_select_own_or_manager
  on public.judge_format_qualifications
  for select to authenticated
  using (judge_id = public.my_judge_id() or public.is_manager());

create policy judge_format_qualifications_admin on public.judge_format_qualifications
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- -------------------------------------------------------------------- events
create policy events_select_authenticated on public.events
  for select to authenticated using (true);

create policy events_manage on public.events
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ------------------------------------------------------------- event_formats
create policy event_formats_select_authenticated on public.event_formats
  for select to authenticated using (true);

create policy event_formats_manage on public.event_formats
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ------------------------------------------------------------- registrations
create policy registrations_select_own_or_staff on public.registrations
  for select to authenticated
  using (student_id = public.my_student_id() or public.is_staff());

-- 学生只能为自己报名，且必须在该活动的报名窗口内
create policy registrations_insert_own on public.registrations
  for insert to authenticated
  with check (
    student_id = public.my_student_id()
    and public.is_event_registration_open(event_id)
  );

-- 学生可改自己的报名（取消 / 签到）。窗口限制在服务端与领域逻辑中进一步收紧；
-- 这里保证不能改别人的报名，也不能把 student_id 改成别人。
create policy registrations_update_own on public.registrations
  for update to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());

create policy registrations_manage on public.registrations
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ------------------------------------------- registration_format_preferences
create policy registration_format_preferences_select on public.registration_format_preferences
  for select to authenticated
  using (public.is_my_registration(registration_id) or public.is_staff());

-- 只能写自己报名的偏好，且报名窗口仍然开放
create policy registration_format_preferences_write_own
  on public.registration_format_preferences
  for all to authenticated
  using (public.is_my_registration_open(registration_id))
  with check (public.is_my_registration_open(registration_id));

create policy registration_format_preferences_manage
  on public.registration_format_preferences
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------- audit_logs
-- 只读，且仅管理角色可读（第 4 节矩阵）。刻意**不**创建 INSERT/UPDATE/DELETE 策略：
-- 应用角色无法通过任何方式修改或删除审计记录（拒绝用例 F-MGR-02、F-ALL-01）。
create policy audit_logs_select_manager on public.audit_logs
  for select to authenticated
  using (public.is_manager());

-- 三重保护的第二重：即使将来有人误加了策略，权限层面也直接拒绝。
revoke update, delete, truncate on public.audit_logs from authenticated, anon;

-- ----------------------------------------------------------- system_settings
-- PERM-D-5 已确认：没有任何需要对学生公开的项，仅超级管理员可读写。
create policy system_settings_admin on public.system_settings
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- =============================================================================
-- 六、辅助函数的执行权限
--
-- SECURITY DEFINER 函数默认对 PUBLIC 开放执行权限。虽然这些函数只报告
-- "当前用户自己"的信息、不泄漏他人数据，仍按最小权限收紧：
-- 撤销 PUBLIC 与 anon 的执行权，只授予 authenticated 与 service_role。
--
-- 触发器函数（set_updated_at 等）**不**需要任何用户执行权限，一并撤销。
-- =============================================================================
do $$
declare
  fn text;
  helpers text[] := array[
    'public.current_profile_id()',
    'public.is_service_role()',
    'public.has_role(public.app_role)',
    'public.is_super_admin()',
    'public.is_manager()',
    'public.is_staff()',
    'public.is_student()',
    'public.is_judge()',
    'public.my_student_id()',
    'public.my_judge_id()',
    'public.is_event_registration_open(uuid)',
    'public.is_my_registration(uuid)',
    'public.is_my_registration_open(uuid)'
  ];
  triggers text[] := array[
    'public.set_updated_at()',
    'public.validate_event_date_matches_start()',
    'public.prevent_profile_status_change()',
    'public.prevent_judge_approval_change()',
    'public.prevent_student_profile_operational_change()',
    'public.handle_new_auth_user()'
  ];
begin
  foreach fn in array helpers loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  foreach fn in array triggers loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
