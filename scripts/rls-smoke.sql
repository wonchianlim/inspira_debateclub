-- =============================================================================
-- RLS 授权冒烟测试（自检：任何用例失败都会让整个脚本报错退出）
--
-- 用法：npm run db:rls-smoke
--        （内部执行 docker exec ... psql -f scripts/rls-smoke.sql）
--
-- 依据主规格第 14.3 节：
--   "Security tests must attempt forbidden reads and writes, not merely confirm
--    allowed operations."
-- 因此下面的用例**必须**同时覆盖"允许"与"拒绝"两个方向。
--
-- 为什么用行数判定而不是"是否报错"：
--   RLS 对 SELECT / UPDATE / DELETE 的拒绝方式是**静默过滤**（返回 0 行），
--   而不是抛错。只有 INSERT 才会抛 "violates row-level security policy"。
--   因此"没有报错"绝不能当作"允许"的证据——必须看受影响的行数。
--
-- 本脚本会**自建虚构测试数据并在结束时清理**，可重复运行。
-- ⚠️ 只用于本地开发数据库。绝不在生产库上运行。
--
-- 说明：这是 P1-5 阶段的冒烟测试。P1-6 会把它扩展为完整的测试套件
--      （含 pgTAP 与全部拒绝用例编号，见 docs/permissions.md 第 6 节）。
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- 一、准备虚构测试账号（全部为 example.invalid，非真实数据）
-- -----------------------------------------------------------------------------
delete from public.registrations;
delete from public.event_formats;
delete from public.events;
delete from public.student_format_profiles;
delete from public.user_roles
  where profile_id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from public.student_profiles
  where profile_id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from public.profiles
  where id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from auth.users
  where id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';

insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','sa@example.invalid'),
 ('aaaaaaaa-0000-0000-0000-000000000002','mgr@example.invalid'),
 ('aaaaaaaa-0000-0000-0000-000000000003','coach@example.invalid'),
 ('aaaaaaaa-0000-0000-0000-000000000004','stua@example.invalid'),
 ('aaaaaaaa-0000-0000-0000-000000000005','stub@example.invalid');

insert into public.user_roles (profile_id, role) values
 ('aaaaaaaa-0000-0000-0000-000000000001','super_admin'),
 ('aaaaaaaa-0000-0000-0000-000000000001','club_manager'),
 ('aaaaaaaa-0000-0000-0000-000000000002','club_manager'),
 ('aaaaaaaa-0000-0000-0000-000000000003','coach'),
 ('aaaaaaaa-0000-0000-0000-000000000004','student'),
 ('aaaaaaaa-0000-0000-0000-000000000005','student');

insert into public.student_profiles (profile_id, school) values
 ('aaaaaaaa-0000-0000-0000-000000000004','虚构中学A'),
 ('aaaaaaaa-0000-0000-0000-000000000005','虚构中学B');

insert into public.student_format_profiles (student_id, format_id, eligible, rating, updated_by)
select sp.id, f.id, true, 7, 'aaaaaaaa-0000-0000-0000-000000000001'
from public.student_profiles sp
join public.debate_formats f on f.code = 'PF';

-- 一个正在报名的活动 + 一个报名已关闭的活动
-- event_date 由 starts_at 按时区推导，以满足一致性校验触发器
with t as (select now() as base, (now() + interval '2 day' + interval '30 min') as starts_at)
insert into public.events
  (id,title,event_date,registration_opens_at,registration_closes_at,check_in_opens_at,warning_at,starts_at,ends_at,status,created_by)
select 'bbbbbbbb-0000-0000-0000-000000000001','开放报名活动',
       (t.starts_at at time zone 'Asia/Shanghai')::date,
       t.base - interval '1 day', t.base + interval '1 day',
       t.starts_at - interval '30 min', t.starts_at - interval '10 min',
       t.starts_at, t.starts_at + interval '1 hour', 'registration_open',
       'aaaaaaaa-0000-0000-0000-000000000001'
from t;

with t as (select (now() + interval '3 day' + interval '30 min') as starts_at)
insert into public.events
  (id,title,event_date,registration_opens_at,registration_closes_at,check_in_opens_at,warning_at,starts_at,ends_at,status,created_by)
select 'bbbbbbbb-0000-0000-0000-000000000002','已关闭活动',
       (t.starts_at at time zone 'Asia/Shanghai')::date,
       t.starts_at - interval '10 day', t.starts_at - interval '5 day',
       t.starts_at - interval '30 min', t.starts_at - interval '10 min',
       t.starts_at, t.starts_at + interval '1 hour', 'registration_closed',
       'aaaaaaaa-0000-0000-0000-000000000001'
from t;

-- -----------------------------------------------------------------------------
-- 二、用例表
--
-- 每条 sql 都必须是一个返回单个整数的 SELECT。
-- 写入类用例用 CTE 包住，使其也能返回受影响行数：
--     with x as (update ... returning 1) select count(*) from x
-- 这样"允许"= 行数 > 0，"拒绝"= 行数为 0，判定标准统一。
-- -----------------------------------------------------------------------------
-- 注意：**不能**加 `on commit drop`。psql 默认逐条自动提交，临时表会在插入后
-- 立刻被删除，后面的用例就找不到它了。临时表在会话结束时自动消失，无需手动清理。
drop table if exists rls_cases;
create temp table rls_cases (ord serial, label text, sub uuid, want text, sql text);
-- 用例表由 postgres 创建，而下面要切换到 authenticated 身份执行用例，
-- 因此必须显式授予读取权限（这也顺带证明了 RLS 与 GRANT 是两套独立机制）。
grant select on rls_cases to authenticated;

insert into rls_cases (label, sub, want, sql) values
-- ---------- 必须允许 ----------
('A1 学生读自己的档案','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000004'$q$),
('A2 学生读自己的角色','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.user_roles where profile_id='aaaaaaaa-0000-0000-0000-000000000004'$q$),
('A3 学生读自己的评分','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.student_format_profiles where student_id=public.my_student_id()$q$),
('A4 管理员读全部档案','aaaaaaaa-0000-0000-0000-000000000002','allow',
 $q$select count(*) from public.profiles$q$),
('A5 教练读学生资格','aaaaaaaa-0000-0000-0000-000000000003','allow',
 $q$select count(*) from public.student_format_profiles$q$),
('A6 学生读赛制列表','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.debate_formats$q$),
('A7 管理员读审计日志(空表)','aaaaaaaa-0000-0000-0000-000000000002','allow_any',
 $q$select count(*) from public.audit_logs$q$),
('A8 超管读系统设置(空表)','aaaaaaaa-0000-0000-0000-000000000001','allow_any',
 $q$select count(*) from public.system_settings$q$),
('A9 学生在开放活动报名','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$with x as (insert into public.registrations (event_id,student_id) values ('bbbbbbbb-0000-0000-0000-000000000001', public.my_student_id()) returning 1) select count(*) from x$q$),
('A10 报名后管理员可见','aaaaaaaa-0000-0000-0000-000000000002','allow',
 $q$select count(*) from public.registrations$q$),

-- ---------- 必须拒绝（对应 docs/permissions.md 第 6 节的拒绝用例编号）----------
('F-STU-01 学生读他人档案','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000005'$q$),
('F-STU-02 学生读他人评分','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.student_format_profiles where student_id=(select id from public.student_profiles where profile_id='aaaaaaaa-0000-0000-0000-000000000005')$q$),
('F-STU-06 学生读审计日志','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.audit_logs$q$),
('F-STU-07 学生自授超管角色','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.user_roles (profile_id,role) values ('aaaaaaaa-0000-0000-0000-000000000004','super_admin') returning 1) select count(*) from x$q$),
('F-STU-08 学生改自己的账号状态','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.profiles set status='suspended' where id='aaaaaaaa-0000-0000-0000-000000000004' returning 1) select count(*) from x$q$),
('F-STU-15 学生写他人学生档案','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.student_profiles set school='x' where profile_id='aaaaaaaa-0000-0000-0000-000000000005' returning 1) select count(*) from x$q$),
('F-STU-16 学生改自己的运营备注','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.student_profiles set notes='自己写的' where profile_id='aaaaaaaa-0000-0000-0000-000000000004' returning 1) select count(*) from x$q$),
('F-STU-17 学生删他人报名','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (delete from public.registrations where student_id=(select id from public.student_profiles where profile_id='aaaaaaaa-0000-0000-0000-000000000005') returning 1) select count(*) from x$q$),
('F-STU-18 学生报名已关闭的活动','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.registrations (event_id,student_id) values ('bbbbbbbb-0000-0000-0000-000000000002', public.my_student_id()) returning 1) select count(*) from x$q$),
('F-STU-19 学生替他人报名','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.registrations (event_id,student_id) values ('bbbbbbbb-0000-0000-0000-000000000001', (select id from public.student_profiles where profile_id='aaaaaaaa-0000-0000-0000-000000000005')) returning 1) select count(*) from x$q$),
('F-COA-01 教练授予角色','aaaaaaaa-0000-0000-0000-000000000003','deny',
 $q$with x as (insert into public.user_roles (profile_id,role) values ('aaaaaaaa-0000-0000-0000-000000000005','coach') returning 1) select count(*) from x$q$),
('F-COA-04 教练读审计日志','aaaaaaaa-0000-0000-0000-000000000003','deny',
 $q$select count(*) from public.audit_logs$q$),
('F-MGR-01 管理员授予超管','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (insert into public.user_roles (profile_id,role) values ('aaaaaaaa-0000-0000-0000-000000000002','super_admin') returning 1) select count(*) from x$q$),
('F-MGR-02 管理员修改审计日志','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (update public.audit_logs set action='x' returning 1) select count(*) from x$q$),
('F-MGR-05 管理员读系统设置','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$select count(*) from public.system_settings$q$),
('F-ALL-01 超管删除审计日志','aaaaaaaa-0000-0000-0000-000000000001','deny',
 $q$with x as (delete from public.audit_logs returning 1) select count(*) from x$q$),
('F-ALL-02 超管修改审计日志','aaaaaaaa-0000-0000-0000-000000000001','deny',
 $q$with x as (update public.audit_logs set action='x' returning 1) select count(*) from x$q$);

-- -----------------------------------------------------------------------------
-- 三、以 authenticated 身份逐条执行并判定
-- -----------------------------------------------------------------------------
set role authenticated;

do $outer$
declare
  c        record;
  n        int;
  failures int := 0;
  passed   int := 0;
  verdict  text;
begin
  for c in select * from rls_cases order by ord loop
    n := -1;
    begin
      perform set_config('request.jwt.claim.sub', c.sub::text, true);
      execute c.sql into n;
      verdict := 'ROWS=' || n;
    exception when others then
      -- INSERT 违反策略会抛错；这属于"被拒绝"
      verdict := 'DENIED';
    end;

    declare
      ok boolean;
    begin
      if c.want = 'allow' then
        ok := (verdict <> 'DENIED' and n > 0);
      elsif c.want = 'allow_any' then
        ok := (verdict <> 'DENIED');
      else
        ok := (verdict = 'DENIED' or n = 0);
      end if;

      if ok then
        passed := passed + 1;
        raise notice 'PASS  % | 期望=% | 实际=%', c.label, c.want, verdict;
      else
        failures := failures + 1;
        raise notice 'FAIL  % | 期望=% | 实际=%', c.label, c.want, verdict;
      end if;
    end;
  end loop;

  raise notice '---- 通过 % 条，失败 % 条，共 % 条 ----', passed, failures, passed + failures;

  if failures > 0 then
    raise exception 'RLS 冒烟测试失败：% 条用例未通过', failures;
  end if;
end
$outer$;

reset role;

-- -----------------------------------------------------------------------------
-- 四、清理虚构数据
-- -----------------------------------------------------------------------------
delete from public.registrations;
delete from public.event_formats;
delete from public.events;
delete from public.student_format_profiles;
delete from public.user_roles
  where profile_id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from public.student_profiles
  where profile_id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from public.profiles
  where id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from auth.users
  where id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';

select '✓ RLS 冒烟测试全部通过，测试数据已清理' as result;
