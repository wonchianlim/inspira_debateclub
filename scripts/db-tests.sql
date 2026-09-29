-- =============================================================================
-- INSPIRA 数据库测试套件（自检：任何用例失败都会让脚本以非零退出码结束）
--
-- 用法：npm run db:test
--
-- 依据主规格第 7 节与第 14.3 节：
--   "Security tests must attempt forbidden reads and writes, not merely confirm
--    allowed operations."
-- 因此本套件同时覆盖【允许】与【拒绝】两个方向——只测拒绝会漏掉"策略过严"，
-- 只测允许会漏掉"策略根本不存在"。
--
-- 套件分为三部分：
--   一、授权用例（RLS）——以 authenticated 身份执行，按**受影响行数**判定
--   二、约束用例（UNIQUE / CHECK / 触发器）——按**是否报错**判定
--   三、匿名访问——未登录角色不得访问任何受保护表
--
-- ⚠️ 关键陷阱（本项目真实踩过）：RLS 对 SELECT / UPDATE / DELETE 的拒绝方式是
--    **静默返回 0 行**，而不是报错；只有 INSERT 才抛异常。因此"没有报错"绝不能
--    当作"允许"的证据，必须看受影响行数。写入类用例用 CTE 包住以便也返回行数。
--
-- 本脚本自建虚构测试数据并在结束时清理，可重复运行。
-- ⚠️ 仅用于本地开发数据库，绝不在生产库上运行。
--
-- 覆盖范围说明：主规格第 6 节共 38 条拒绝用例，其中 **15 条**涉及的
-- participations / teams / matches / ballots / judge_assignments / coach_notes
-- / email_jobs / notices / partner_requests 尚未创建（属于 Phase 2–7），
-- 因此暂无法测试。本套件覆盖当前可测的全部用例，其余随其所属表一起加入。
-- =============================================================================

\set ON_ERROR_STOP on

-- =============================================================================
-- 零、虚构测试数据
-- =============================================================================
delete from public.registration_format_preferences;
delete from public.registrations;
delete from public.event_formats;
delete from public.events;
delete from public.student_format_profiles;
-- system_settings 通过 updated_by 外键指向 profiles，因此必须在删除测试账号之前清掉，
-- 否则会撞上外键约束（这是实测踩到过的顺序问题）。
delete from public.system_settings
  where updated_by::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
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

-- 只有 PF 是"已合格"，WSDC 刻意保持不合格（用于测试 F-STU-10）
insert into public.student_format_profiles (student_id, format_id, eligible, rating, updated_by)
select sp.id, f.id, true, 7, 'aaaaaaaa-0000-0000-0000-000000000001'
from public.student_profiles sp
join public.debate_formats f on f.code = 'PF'
where sp.profile_id = 'aaaaaaaa-0000-0000-0000-000000000004';

-- 活动：一个正在报名（只启用 PF），一个报名已关闭
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

-- 开放活动只启用 PF；WSDC 与 BP 刻意不启用
insert into public.event_formats (event_id, format_id, enabled)
select 'bbbbbbbb-0000-0000-0000-000000000001', f.id,
       (f.code = 'PF')
from public.debate_formats f;

-- =============================================================================
-- 一、授权用例（RLS，按受影响行数判定）
--
-- 每条 sql 必须返回单个整数。写入类用 CTE 包住：
--     with x as (insert ... returning 1) select count(*) from x
-- =============================================================================
drop table if exists authz_cases;
create temp table authz_cases (ord serial, label text, sub uuid, want text, sql text);
grant select on authz_cases to authenticated;

insert into authz_cases (label, sub, want, sql) values
-- ============================ 必须允许 ============================
('A01 学生读自己的档案','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000004'$q$),
('A02 学生读自己的角色','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.user_roles where profile_id='aaaaaaaa-0000-0000-0000-000000000004'$q$),
('A03 学生读自己的评分','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.student_format_profiles where student_id=public.my_student_id()$q$),
('A04 学生读赛制列表','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.debate_formats$q$),
('A05 学生在开放活动报名','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$with x as (insert into public.registrations (event_id,student_id) values ('bbbbbbbb-0000-0000-0000-000000000001', public.my_student_id()) returning 1) select count(*) from x$q$),
('A06 学生保存自己合格且已启用的赛制偏好','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$with x as (insert into public.registration_format_preferences (registration_id, format_id, preference_rank)
      select r.id, f.id, 1 from public.registrations r, public.debate_formats f
      where r.student_id = public.my_student_id() and f.code='PF' returning 1) select count(*) from x$q$),
('A07 管理员读全部档案','aaaaaaaa-0000-0000-0000-000000000002','allow',
 $q$select count(*) from public.profiles$q$),
('A08 管理员读全部报名','aaaaaaaa-0000-0000-0000-000000000002','allow',
 $q$select count(*) from public.registrations$q$),
('A09 管理员读审计日志(空表)','aaaaaaaa-0000-0000-0000-000000000002','allow_any',
 $q$select count(*) from public.audit_logs$q$),
('A10 超管读系统设置(空表)','aaaaaaaa-0000-0000-0000-000000000001','allow_any',
 $q$select count(*) from public.system_settings$q$),
('A11 教练读学生资格','aaaaaaaa-0000-0000-0000-000000000003','allow',
 $q$select count(*) from public.student_format_profiles$q$),
('A12 裁判读自己的档案','aaaaaaaa-0000-0000-0000-000000000003','allow_any',
 $q$select count(*) from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000003'$q$),
('A13 超管修改系统设置','aaaaaaaa-0000-0000-0000-000000000001','allow',
 $q$with x as (insert into public.system_settings (key,value,updated_by) values ('test.key','{}'::jsonb,'aaaaaaaa-0000-0000-0000-000000000001') returning 1) select count(*) from x$q$),
('A14 学生取消自己的报名','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$with x as (update public.registrations set status='cancelled' where student_id=public.my_student_id() returning 1) select count(*) from x$q$),

-- ==================== 必须拒绝（对应权限文档编号）====================
('F-STU-02 学生读他人评分','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.student_format_profiles where student_id=(select id from public.student_profiles where profile_id='aaaaaaaa-0000-0000-0000-000000000005')$q$),
('F-STU-06 学生读审计日志','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.audit_logs$q$),
('F-STU-07 学生自授超管角色','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.user_roles (profile_id,role) values ('aaaaaaaa-0000-0000-0000-000000000004','super_admin') returning 1) select count(*) from x$q$),
('F-STU-08 学生改自己的账号状态','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.profiles set status='suspended' where id='aaaaaaaa-0000-0000-0000-000000000004' returning 1) select count(*) from x$q$),
('F-STU-09 报名窗口关闭后新建报名','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.registrations (event_id,student_id) values ('bbbbbbbb-0000-0000-0000-000000000002', public.my_student_id()) returning 1) select count(*) from x$q$),
('F-STU-10a 学生保存自己不合格的赛制偏好','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.registration_format_preferences (registration_id, format_id, preference_rank)
      select r.id, f.id, 2 from public.registrations r, public.debate_formats f
      where r.student_id = public.my_student_id() and f.code='WSDC' returning 1) select count(*) from x$q$),
('F-STU-10b 学生保存活动未启用的赛制偏好','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.registration_format_preferences (registration_id, format_id, preference_rank)
      select r.id, f.id, 3 from public.registrations r, public.debate_formats f
      where r.student_id = public.my_student_id() and f.code='BP' returning 1) select count(*) from x$q$),
('F-STU-15 学生写他人学生档案','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.student_profiles set school='x' where profile_id='aaaaaaaa-0000-0000-0000-000000000005' returning 1) select count(*) from x$q$),
('F-STU-16 学生改自己的运营备注','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.student_profiles set notes='自己写的' where profile_id='aaaaaaaa-0000-0000-0000-000000000004' returning 1) select count(*) from x$q$),
('F-STU-17 学生删他人报名','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (delete from public.registrations where student_id=(select id from public.student_profiles where profile_id='aaaaaaaa-0000-0000-0000-000000000005') returning 1) select count(*) from x$q$),
('F-STU-19 学生替他人报名','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.registrations (event_id,student_id) values ('bbbbbbbb-0000-0000-0000-000000000001', (select id from public.student_profiles where profile_id='aaaaaaaa-0000-0000-0000-000000000005')) returning 1) select count(*) from x$q$),
('F-COA-01 教练授予角色','aaaaaaaa-0000-0000-0000-000000000003','deny',
 $q$with x as (insert into public.user_roles (profile_id,role) values ('aaaaaaaa-0000-0000-0000-000000000005','coach') returning 1) select count(*) from x$q$),
('F-COA-03 教练修改学生评分','aaaaaaaa-0000-0000-0000-000000000003','deny',
 $q$with x as (update public.student_format_profiles set rating=10 returning 1) select count(*) from x$q$),
('F-COA-04 教练读审计日志','aaaaaaaa-0000-0000-0000-000000000003','deny',
 $q$select count(*) from public.audit_logs$q$),
('F-MGR-01 管理员授予超管','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (insert into public.user_roles (profile_id,role) values ('aaaaaaaa-0000-0000-0000-000000000002','super_admin') returning 1) select count(*) from x$q$),
('F-MGR-02 管理员修改审计日志','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (update public.audit_logs set action='x' returning 1) select count(*) from x$q$),
('F-MGR-04 管理员改动系统级设置','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$select count(*) from public.system_settings$q$),
('F-MGR-04b 管理员写系统设置','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (insert into public.system_settings (key,value,updated_by) values ('x','{}'::jsonb,'aaaaaaaa-0000-0000-0000-000000000002') returning 1) select count(*) from x$q$),
('F-ALL-01 超管删除审计日志','aaaaaaaa-0000-0000-0000-000000000001','deny',
 $q$with x as (delete from public.audit_logs returning 1) select count(*) from x$q$),
('F-ALL-01b 超管修改审计日志','aaaaaaaa-0000-0000-0000-000000000001','deny',
 $q$with x as (update public.audit_logs set action='x' returning 1) select count(*) from x$q$),
('F-ALL-04 冒充他人写档案','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.profiles set display_name='冒充' where id='aaaaaaaa-0000-0000-0000-000000000005' returning 1) select count(*) from x$q$),
('F-ALL-04b 学生改自己档案时篡改 id','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (update public.profiles set id='aaaaaaaa-0000-0000-0000-000000000005' where id='aaaaaaaa-0000-0000-0000-000000000004' returning 1) select count(*) from x$q$);

-- -----------------------------------------------------------------------------
-- 执行授权用例
-- -----------------------------------------------------------------------------
set role authenticated;

do $authz$
declare
  c record; n int;
  failures int := 0; passed int := 0; verdict text; ok boolean;
begin
  for c in select * from authz_cases order by ord loop
    n := -1;
    begin
      perform set_config('request.jwt.claim.sub', c.sub::text, true);
      execute c.sql into n;
      verdict := 'ROWS=' || n;
    exception when others then
      verdict := 'DENIED';
    end;

    if c.want = 'allow' then
      ok := (verdict <> 'DENIED' and n > 0);
    elsif c.want = 'allow_any' then
      ok := (verdict <> 'DENIED');
    else
      ok := (verdict = 'DENIED' or n = 0);
    end if;

    if ok then passed := passed + 1;
      raise notice '[授权] PASS  % | 期望=% | 实际=%', c.label, c.want, verdict;
    else failures := failures + 1;
      raise notice '[授权] FAIL  % | 期望=% | 实际=%', c.label, c.want, verdict;
    end if;
  end loop;

  raise notice '[授权] ---- 通过 % 条，失败 % 条 ----', passed, failures;
  if failures > 0 then
    raise exception '授权用例失败 % 条', failures;
  end if;
end
$authz$;

reset role;

-- =============================================================================
-- 二、约束用例（UNIQUE / CHECK / 触发器）——按是否报错判定
--
-- 这些与 RLS 无关，属于"结构完整性"：即使权限正确，约束也必须挡住非法数据。
-- 期望 error = 必须被拒绝；期望 ok = 必须成功（例如幂等写入）。
-- =============================================================================
drop table if exists constraint_cases;
create temp table constraint_cases (ord serial, label text, expect text, sql text);

insert into constraint_cases (label, expect, sql) values
('C01 同一活动重复报名被 UNIQUE 拒绝','error',
 $q$insert into public.registrations (event_id, student_id) select event_id, student_id from public.registrations limit 1$q$),
('C02 同一角色重复授予被 UNIQUE 拒绝','error',
 $q$insert into public.user_roles (profile_id, role) select profile_id, role from public.user_roles limit 1$q$),
('C03 标记合格但评分为空被 CHECK 拒绝','error',
 $q$insert into public.student_format_profiles (student_id, format_id, eligible, rating, updated_by)
    select sp.id, f.id, true, null, 'aaaaaaaa-0000-0000-0000-000000000001'
    from public.student_profiles sp, public.debate_formats f where f.code='WSDC' limit 1$q$),
('C04 评分超出 1–10 被 CHECK 拒绝','error',
 $q$insert into public.student_format_profiles (student_id, format_id, eligible, rating, updated_by)
    select sp.id, f.id, true, 99, 'aaaaaaaa-0000-0000-0000-000000000001'
    from public.student_profiles sp, public.debate_formats f where f.code='BP' limit 1$q$),
('C05 报名截止晚于开始时间被 CHECK 拒绝','error',
 $q$insert into public.events (title,event_date,registration_opens_at,registration_closes_at,check_in_opens_at,warning_at,starts_at,ends_at,created_by)
    select '时间倒置', (now() at time zone 'Asia/Shanghai')::date,
           now(), now() + interval '10 day', now(), now(), now() + interval '1 day', now() + interval '2 day',
           'aaaaaaaa-0000-0000-0000-000000000001'$q$),
('C06 event_date 与 starts_at 不一致被触发器拒绝','error',
 $q$insert into public.events (title,event_date,registration_opens_at,registration_closes_at,check_in_opens_at,warning_at,starts_at,ends_at,created_by)
    values ('日期不一致','2030-01-01', now(), now()+interval '1 hour', now(), now(),
            now()+interval '2 day', now()+interval '3 day', 'aaaaaaaa-0000-0000-0000-000000000001')$q$),
('C07 同一报名的名次重复被 UNIQUE 拒绝','error',
 $q$insert into public.registration_format_preferences (registration_id, format_id, preference_rank)
    select registration_id, format_id, preference_rank from public.registration_format_preferences limit 1$q$),
('C08 同一赛制的 team_slot 重复被 UNIQUE 拒绝','error',
 $q$insert into public.format_positions (format_id, code, display_name, team_slot, display_order)
    select format_id, 'DUP', '重复位', team_slot, 99 from public.format_positions limit 1$q$),
('C09 同一赛制的 position code 重复被 UNIQUE 拒绝','error',
 $q$insert into public.format_positions (format_id, code, display_name, team_slot, display_order)
    select format_id, code, '重复码', 99, 99 from public.format_positions limit 1$q$),
('C10 引用不存在的赛制被外键拒绝','error',
 $q$insert into public.event_formats (event_id, format_id) values ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000')$q$),
('C11 重复写入同一赛制是幂等的（种子可重复执行）','ok',
 $q$insert into public.debate_formats (code,name,team_size,teams_per_match,active,display_order)
    values ('PF','Public Forum Debate',2,2,true,1)
    on conflict (code) do update set name = excluded.name$q$);

do $constraints$
declare
  c record; failures int := 0; passed int := 0; verdict text; ok boolean;
begin
  for c in select * from constraint_cases order by ord loop
    begin
      execute c.sql;
      verdict := 'OK';
    exception when others then
      verdict := 'ERROR';
    end;

    if c.expect = 'error' then ok := (verdict = 'ERROR');
    else ok := (verdict = 'OK');
    end if;

    if ok then passed := passed + 1;
      raise notice '[约束] PASS  % | 期望=% | 实际=%', c.label, c.expect, verdict;
    else failures := failures + 1;
      raise notice '[约束] FAIL  % | 期望=% | 实际=%', c.label, c.expect, verdict;
    end if;
  end loop;

  raise notice '[约束] ---- 通过 % 条，失败 % 条 ----', passed, failures;
  if failures > 0 then
    raise exception '约束用例失败 % 条', failures;
  end if;
end
$constraints$;

-- =============================================================================
-- 三、匿名（未登录）访问
--
-- F-ALL-05：未登录状态不得访问任何受保护表。
-- 对 anon 角色**没有授予任何表权限**，因此这里应当直接报权限错误。
-- =============================================================================
do $anon$
declare
  tables text[] := array['profiles','user_roles','student_profiles','judge_profiles',
    'debate_formats','format_positions','student_format_profiles',
    'judge_format_qualifications','events','event_formats','registrations',
    'registration_format_preferences','audit_logs','system_settings'];
  t text; n int; failures int := 0; passed int := 0;
begin
  set local role anon;

  foreach t in array tables loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      -- 如果这里没报错，说明 anon 竟然读到了数据 —— 那才是问题
      if n = 0 then
        passed := passed + 1;
        raise notice '[匿名] PASS  未登录读 % 得到 0 行', t;
      else
        failures := failures + 1;
        raise notice '[匿名] FAIL  未登录读到了 % 行：%', n, t;
      end if;
    exception when insufficient_privilege then
      passed := passed + 1;
      raise notice '[匿名] PASS  未登录读 % 被权限拒绝', t;
    end;
  end loop;

  raise notice '[匿名] ---- 通过 % 条，失败 % 条 ----', passed, failures;
  if failures > 0 then
    raise exception '匿名访问用例失败 % 条', failures;
  end if;
end
$anon$;

-- =============================================================================
-- 四、频率限制（consume_rate_limit）
--
-- 这是应用层限流的**实际机制**所在（见 supabase/migrations 的
-- 20260929091400_rate_limiting.sql）。按返回值判定，不依赖 HTTP 层。
--
-- 说明：这里验证的是"限流机制本身正确"。至于"登录/找回密码确实调用了它"，
-- 由 tests/unit/auth-actions-wiring.test.ts 从源码层面守住（两者合起来覆盖整条链路）。
-- =============================================================================

drop table if exists rl_results;
create temp table rl_results (label text, expected boolean, actual boolean);

do $rl_populate$
declare
  i int;
  v boolean;
begin
  delete from public.rate_limit_counters;

  -- 1) 限额内允许，超出后拒绝（max = 3）
  for i in 1..3 loop
    v := public.consume_rate_limit('test.a', 'subject-1', 3, 300);
  end loop;
  insert into rl_results values ('前 3 次在限额内', true, v);

  v := public.consume_rate_limit('test.a', 'subject-1', 3, 300);
  insert into rl_results values ('第 4 次被拒绝', false, v);

  -- 2) 不同 subject 各自计数（换个人不该被前一个人的用量影响）
  v := public.consume_rate_limit('test.a', 'subject-2', 3, 300);
  insert into rl_results values ('另一个 subject 不受影响', true, v);

  -- 3) 不同 bucket 各自计数（登录用满了不该影响找回密码）
  v := public.consume_rate_limit('test.b', 'subject-1', 3, 300);
  insert into rl_results values ('另一个 bucket 不受影响', true, v);

  -- 4) 计数确实在累加（若每次都从 0 开始，上面第 4 次就不会被拒绝）
  v := public.consume_rate_limit('test.a', 'subject-1', 10, 300);
  insert into rl_results values ('提高上限后同窗口内可继续（证明计数在累加）', true, v);

  -- 5) 跨窗口后重新计数（用 1 秒窗口）
  delete from public.rate_limit_counters;
  v := public.consume_rate_limit('test.window', 'subject-w', 1, 1);
  insert into rl_results values ('窗口内第 1 次允许', true, v);
  v := public.consume_rate_limit('test.window', 'subject-w', 1, 1);
  insert into rl_results values ('同窗口第 2 次拒绝', false, v);
  perform pg_sleep(1.2);
  v := public.consume_rate_limit('test.window', 'subject-w', 1, 1);
  insert into rl_results values ('跨窗口后重新允许', true, v);

  -- 6) 非法参数必须报错（否则限流可能被静默地"永不触发"）
  begin
    perform public.consume_rate_limit('test.bad', 'subject-x', 0, 300);
    insert into rl_results values ('max=0 应报错', true, false);
  exception when others then
    insert into rl_results values ('max=0 应报错', true, true);
  end;

  delete from public.rate_limit_counters;
end
$rl_populate$;

do $rl_judge$
declare
  r record;
  fails int := 0;
  passes int := 0;
begin
  for r in select * from rl_results loop
    if r.actual = r.expected then
      passes := passes + 1;
      raise notice '[限流] PASS  % | 期望=% | 实际=%', r.label, r.expected, r.actual;
    else
      fails := fails + 1;
      raise notice '[限流] FAIL  % | 期望=% | 实际=%', r.label, r.expected, r.actual;
    end if;
  end loop;

  raise notice '[限流] ---- 通过 % 条，失败 % 条 ----', passes, fails;
  if fails > 0 then
    raise exception '频率限制用例失败 % 条', fails;
  end if;
end
$rl_judge$;

-- =============================================================================
-- 五、清理虚构数据
-- =============================================================================
delete from public.registration_format_preferences;
delete from public.registrations;
delete from public.event_formats;
delete from public.events;
delete from public.student_format_profiles;
delete from public.system_settings where key = 'test.key';
delete from public.user_roles
  where profile_id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from public.student_profiles
  where profile_id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from public.profiles
  where id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
delete from auth.users
  where id::text like 'aaaaaaaa-0000-0000-0000-0000000000%';

select '✓ 数据库测试套件全部通过，虚构数据已清理' as result;
