-- =============================================================================
-- 20260929092500_check_in_method_integrity.sql
--
-- 防止学生把自己伪造成"管理员代签"（Phase 6）。
--
-- -----------------------------------------------------------------------------
-- 实测发现的问题
--
-- `registrations` 上的 `registrations_update_own` 策略允许学生更新**自己**的报名行
-- （这是必要的：学生要能自助签到）。但那一行里还有 `check_in_method` 这一列，
-- 于是实测可以直接这样写：
--
--     update registrations set checked_in_at = now(),
--                              check_in_method = 'admin',
--                              status = 'checked_in'
--      where student_id = my_student_id();
--     → 成功
--
-- 也就是说**学生可以把自己标成"管理员代签"**。
--
-- 影响范围有限（只能改自己那一行，改不了别人），但它是**记录真实性的问题**：
-- 签到方式存在的意义就是事后能分清"学生自己签的"与"管理员代签的" ——
-- 如果学生能自己写成 admin，这个区分在争议时就不成立了。
--
-- 因此加一条触发器：`check_in_method = 'admin'` 只能由管理员或 service_role 写入。
--
-- 为什么放数据库层：这是**谁可以写入哪个值**的规则，属于数据完整性，
-- 和 RLS 是同一层的问题。放在应用层的话，任何一处绕过
-- （例如直接调用 PostgREST）都能写进去。
-- =============================================================================

create or replace function public.enforce_check_in_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 只有"管理员代签"这一个值需要保护；'self' 是学生本来就有权写的
  if new.check_in_method = 'admin'
     and not (public.is_manager() or public.is_service_role()) then
    raise exception '只有俱乐部管理员或超级管理员可以把签到记为「管理员代签」'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

comment on function public.enforce_check_in_method() is
  '阻止学生把自己的签到记为「管理员代签」。只保护 admin 这一个值，self 不受影响。';

drop trigger if exists registrations_enforce_check_in_method on public.registrations;
create trigger registrations_enforce_check_in_method
  before insert or update on public.registrations
  for each row execute function public.enforce_check_in_method();
