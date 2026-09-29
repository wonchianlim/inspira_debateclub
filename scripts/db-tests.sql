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
delete from public.audit_logs;
delete from public.notices where created_by::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
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

-- 通知（Phase 2 新增）。刻意覆盖四种受众，并包含一条草稿：
--   cccc...0001 全体、已发布      → 所有登录用户可见
--   cccc...0002 全体、草稿        → 只有管理员可见
--   cccc...0003 角色=judge        → 只有裁判可见
--   cccc...0004 活动=开放报名活动  → 只有该活动的报名学生可见
--   cccc...0005 赛制=PF           → 只有对该赛制有档案的人可见
--   cccc...0006 赛制=WSDC         → 学生 A 没有 WSDC 档案，因此看不到
insert into public.notices
  (id,title,body,audience_type,event_id,role,format_id,published_at,created_by)
values
  ('cccccccc-0000-0000-0000-000000000001','全体已发布','正文','global',null,null,null,
   now() - interval '1 hour','aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002','全体草稿','正文','global',null,null,null,
   null,'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000003','裁判通知','正文','role',null,'judge',null,
   now() - interval '1 hour','aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000004','活动通知','正文','event',
   'bbbbbbbb-0000-0000-0000-000000000001',null,null,
   now() - interval '1 hour','aaaaaaaa-0000-0000-0000-000000000001');

insert into public.notices
  (id,title,body,audience_type,format_id,published_at,created_by)
select v.id::uuid, v.title, '正文', 'format', f.id, now() - interval '1 hour',
       'aaaaaaaa-0000-0000-0000-000000000001'
from (values ('cccccccc-0000-0000-0000-000000000005','PF 通知','PF'),
             ('cccccccc-0000-0000-0000-000000000006','WSDC 通知','WSDC')) as v(id,title,code)
join public.debate_formats f on f.code = v.code;

-- 学生 B 在开放活动上的报名。刻意放在测试数据阶段而不是用例里：
-- 学生 A 的报名会被 A14（取消报名）置为 cancelled，
-- 而"活动受众"的通知**不应**发给已取消报名的人（这正是策略的预期行为）。
-- 因此"能读到活动通知"这条正向用例必须用一位报名仍然有效的人来验证。
insert into public.registrations (event_id, student_id)
select 'bbbbbbbb-0000-0000-0000-000000000001', sp.id
from public.student_profiles sp
where sp.profile_id = 'aaaaaaaa-0000-0000-0000-000000000005';

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
 $q$with x as (update public.profiles set id='aaaaaaaa-0000-0000-0000-000000000005' where id='aaaaaaaa-0000-0000-0000-000000000004' returning 1) select count(*) from x$q$),

-- ============================ 通知（Phase 2 新增）============================
('A15 学生读已发布的全体通知','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.notices where audience_type='global' and published_at is not null$q$),
('A16 管理员读全部通知（含草稿）','aaaaaaaa-0000-0000-0000-000000000002','allow',
 $q$select count(*) from public.notices$q$),
('A17 学生读自己有档案的赛制通知','aaaaaaaa-0000-0000-0000-000000000004','allow',
 $q$select count(*) from public.notices n join public.debate_formats f on f.id=n.format_id where f.code='PF'$q$),
('A18 学生读自己已报名活动的通知','aaaaaaaa-0000-0000-0000-000000000005','allow',
 $q$select count(*) from public.notices where event_id='bbbbbbbb-0000-0000-0000-000000000001'$q$),
('F-STU-20 学生读未发布的通知草稿','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.notices where published_at is null$q$),
('F-STU-21 学生读发给裁判角色的通知','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.notices where audience_type='role'$q$),
('F-STU-22 学生读自己没有档案的赛制通知','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.notices n join public.debate_formats f on f.id=n.format_id where f.code='WSDC'$q$),
('F-STU-23 学生读自己未报名活动的通知','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$select count(*) from public.notices where event_id='bbbbbbbb-0000-0000-0000-000000000002'$q$),
('F-STU-24 学生自行创建通知','aaaaaaaa-0000-0000-0000-000000000004','deny',
 $q$with x as (insert into public.notices (title,body,audience_type,created_by) values ('伪造','正文','global',public.current_profile_id()) returning 1) select count(*) from x$q$),
('F-COA-06 教练自行创建通知','aaaaaaaa-0000-0000-0000-000000000003','deny',
 $q$with x as (insert into public.notices (title,body,audience_type,created_by) values ('伪造','正文','global',public.current_profile_id()) returning 1) select count(*) from x$q$),

-- ==================== 账号状态与角色（Phase 2 / P2-4 新增）====================
-- 目的：证明"只有超管能改账号状态、只有超管能授予角色"是**数据库**保证的，
-- 而不是只靠应用里的一段判断。应用判断可以被绕过，数据库策略不能。
('A19 超管修改他人账号状态','aaaaaaaa-0000-0000-0000-000000000001','allow',
 $q$with x as (update public.profiles set status='suspended' where id='aaaaaaaa-0000-0000-0000-000000000005' returning 1) select count(*) from x$q$),
('A20 超管授予学生角色','aaaaaaaa-0000-0000-0000-000000000001','allow',
 $q$with x as (insert into public.user_roles (profile_id, role) values ('aaaaaaaa-0000-0000-0000-000000000003','student') returning 1) select count(*) from x$q$),
-- 注意：目标状态必须与**当前状态不同**，否则这条用例是空的。
-- 触发器只在状态真的发生变化时才拦截；若这次 UPDATE 没有改变状态，
-- 它会"成功"返回 1 行，用例就会被误判成"应当拒绝却允许了"。
-- 实测就是这样踩到的：A19 已把该账号改成 suspended，这条又改成 suspended，等于没做。
-- 教训：权限用例必须真的尝试一次违规操作，不能只走形式。
('F-MGR-07 管理员修改他人账号状态','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (update public.profiles set status='inactive' where id='aaaaaaaa-0000-0000-0000-000000000004' returning 1) select count(*) from x$q$),
('F-MGR-08 管理员授予学生角色（非超管角色也不行）','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (insert into public.user_roles (profile_id, role) values ('aaaaaaaa-0000-0000-0000-000000000004','judge') returning 1) select count(*) from x$q$),
('F-MGR-09 管理员撤销他人角色','aaaaaaaa-0000-0000-0000-000000000002','deny',
 $q$with x as (delete from public.user_roles where profile_id='aaaaaaaa-0000-0000-0000-000000000003' and role='coach' returning 1) select count(*) from x$q$);

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
    on conflict (code) do update set name = excluded.name$q$),

-- ============================ 通知约束（Phase 2 新增）============================
('C12 通知受众为 role 却填了 event_id 被 CHECK 拒绝','error',
 $q$insert into public.notices (title,body,audience_type,event_id,role,created_by)
    values ('x','正文','role','bbbbbbbb-0000-0000-0000-000000000001','judge',
            'aaaaaaaa-0000-0000-0000-000000000001')$q$),
('C13 通知受众为 event 却没填 event_id 被 CHECK 拒绝','error',
 $q$insert into public.notices (title,body,audience_type,created_by)
    values ('x','正文','event','aaaaaaaa-0000-0000-0000-000000000001')$q$),
('C14 通知受众为 format 却填了 role 被 CHECK 拒绝','error',
 $q$insert into public.notices (title,body,audience_type,role,format_id,created_by)
    values ('x','正文','format','student',
            (select id from public.debate_formats where code='PF'),
            'aaaaaaaa-0000-0000-0000-000000000001')$q$),
('C15 通知标题为空白被 CHECK 拒绝','error',
 $q$insert into public.notices (title,body,audience_type,created_by)
    values ('   ','正文','global','aaaaaaaa-0000-0000-0000-000000000001')$q$),
('C16 通知正文为空白被 CHECK 拒绝','error',
 $q$insert into public.notices (title,body,audience_type,created_by)
    values ('标题','   ','global','aaaaaaaa-0000-0000-0000-000000000001')$q$),
('C17 通知过期时间早于发布时间被 CHECK 拒绝','error',
 $q$insert into public.notices (title,body,audience_type,published_at,expires_at,created_by)
    values ('x','正文','global', now(), now() - interval '1 hour',
            'aaaaaaaa-0000-0000-0000-000000000001')$q$);

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
    'registration_format_preferences','audit_logs','system_settings','notices'];
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
-- 五、审计日志（由触发器自动写入）
--
-- 验证的是"触发器真的在工作"，而不是"应用记得写审计"：
-- 下面这些改动**没有任何应用代码参与**，全部由数据库触发器留痕。
-- =============================================================================

drop table if exists audit_results;
-- 刻意不用 serial：serial 会创建一个序列，而 authenticated 对该序列没有权限，
-- 插入时会报 "permission denied for sequence"。显式编号更好控制，也少一个权限面。
create temp table audit_results (ord int, label text, expected text, actual text);
grant insert, select on audit_results to authenticated;

-- ---- 1) 操作者与动作被正确记录 ----
set role authenticated;
do $audit_actor$
declare
  v_before int;
  v_after int;
  v_actor uuid;
  v_action text;
begin
  -- ⚠️ 必须先设定操作者再计数。
  -- audit_logs 的 SELECT 受 RLS 限制（只有管理员能看到），
  -- 若先以"上一个身份"计数，再切换成超管计数，两次看到的行数根本不是一个集合 ——
  -- 差值会变成一个巨大的假数字（实测得到 58）。这是我踩过的坑。
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  select count(*) into v_before from public.audit_logs;

  -- 以超管身份授予一个角色
  insert into public.user_roles (profile_id, role)
  values ('aaaaaaaa-0000-0000-0000-000000000003', 'judge');

  select count(*) into v_after from public.audit_logs;
  insert into audit_results (ord, label, expected, actual)
  values (1, '授权角色后新增一条审计记录', '1', (v_after - v_before)::text);

  select actor_profile_id, action into v_actor, v_action
  from public.audit_logs
  where entity_type = 'user_roles'
  order by created_at desc, id desc
  limit 1;

  insert into audit_results (ord, label, expected, actual)
  values (2, '审计记录的操作者就是本人',
          'aaaaaaaa-0000-0000-0000-000000000001',
          coalesce(v_actor::text, 'NULL'));

  insert into audit_results (ord, label, expected, actual)
  values (3, '审计记录的动作是 insert', 'insert', coalesce(v_action, 'NULL'));
end
$audit_actor$;
reset role;

-- ---- 2) 敏感字段被遮蔽 ----
do $audit_redact$
declare
  v_leak int;
  v_masked int;
begin
  update public.profiles
     set email = 'leak-probe@example.invalid'
   where id = 'aaaaaaaa-0000-0000-0000-000000000004';

  -- 明文邮箱**绝不能**出现在审计里
  select count(*) into v_leak
  from public.audit_logs
  where entity_type = 'profiles'
    and (old_value::text like '%leak-probe%' or new_value::text like '%leak-probe%');

  insert into audit_results (ord, label, expected, actual)
  values (4, '审计中不出现明文邮箱', '0', v_leak::text);

  -- 但"邮箱被改过"这件事必须留下痕迹
  select count(*) into v_masked
  from public.audit_logs
  where entity_type = 'profiles'
    and new_value::text like '%已隐去%';

  insert into audit_results (ord, label, expected, actual)
  values (5, '审计中出现遮蔽标记（说明改动被记录）',
          '有', case when v_masked > 0 then '有' else '无' end);

  -- 嵌套结构里的敏感键也要遮蔽（system_settings.value 是 jsonb）
  update public.system_settings
     set value = '{"api_key":"sk-should-not-be-logged"}'::jsonb
   where key = 'test.key';

  insert into audit_results (ord, label, expected, actual)
  values (6, '嵌套 jsonb 中的敏感键也被遮蔽',
          '0',
          (select count(*)::text from public.audit_logs
            where entity_type = 'system_settings'
              and (old_value::text like '%sk-should-not-be-logged%'
                or new_value::text like '%sk-should-not-be-logged%')));
end
$audit_redact$;

-- ---- 3) 没有实际变化时不记录（避免噪音）----
do $audit_noop$
declare
  v_before int;
  v_after int;
begin
  select count(*) into v_before from public.audit_logs where entity_type = 'profiles';

  -- 只把 updated_at 刷新了一次，业务字段没有变化
  update public.profiles
     set display_name = display_name
   where id = 'aaaaaaaa-0000-0000-0000-000000000004';

  select count(*) into v_after from public.audit_logs where entity_type = 'profiles';

  insert into audit_results (ord, label, expected, actual)
  values (7, '无实际变化不产生审计记录（updated_at 不算变化）', '0', (v_after - v_before)::text);
end
$audit_noop$;

-- ---- 4) 删除留痕 ----
set role authenticated;
do $audit_delete$
declare
  v_before int;
  v_after int;
  v_action text;
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
  select count(*) into v_before from public.audit_logs where entity_type = 'notices';

  delete from public.notices where id = 'cccccccc-0000-0000-0000-000000000006';

  select count(*) into v_after from public.audit_logs where entity_type = 'notices';
  insert into audit_results (ord, label, expected, actual)
  values (8, '删除通知后新增审计记录', '1', (v_after - v_before)::text);

  select action into v_action
  from public.audit_logs
  where entity_type = 'notices' and action = 'delete'
  order by created_at desc, id desc limit 1;

  insert into audit_results (ord, label, expected, actual)
  values (9, '删除的审计动作是 delete', 'delete', coalesce(v_action, 'NULL'));
end
$audit_delete$;
reset role;

-- ---- 判定 ----
do $audit_judge$
declare
  r record;
  fails int := 0;
  passes int := 0;
begin
  for r in select * from audit_results order by ord loop
    if r.actual = r.expected then
      passes := passes + 1;
      raise notice '[审计] PASS  % | 期望=% | 实际=%', r.label, r.expected, r.actual;
    else
      fails := fails + 1;
      raise notice '[审计] FAIL  % | 期望=% | 实际=%', r.label, r.expected, r.actual;
    end if;
  end loop;

  raise notice '[审计] ---- 通过 % 条，失败 % 条 ----', passes, fails;
  if fails > 0 then
    raise exception '审计用例失败 % 条', fails;
  end if;
end
$audit_judge$;

-- =============================================================================
-- 六、清理虚构数据
-- =============================================================================
delete from public.registration_format_preferences;
delete from public.registrations;
delete from public.audit_logs;
delete from public.notices where created_by::text like 'aaaaaaaa-0000-0000-0000-0000000000%';
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
