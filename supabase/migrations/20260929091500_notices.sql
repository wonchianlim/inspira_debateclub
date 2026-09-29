-- =============================================================================
-- 20260929091500_notices.sql
--
-- 通知（主规格第 6.3 节 "notices"）。
--
-- Phase 1 建表时没有创建这张表（它属于 Phase 2 的"通知管理与活动列表"），
-- 因此这里补上。
--
-- 关于"受众"的设计（重要）：
--   规范规定受众有四类：global / event / role / format。
--   规范明确要求"用 CHECK 约束保证受众类型与目标列匹配"，
--   但没有定义每一类的**可见范围**。以下是我采用的解释，已请产品负责人确认：
--
--     global —— 全体已登录用户
--     event  —— 该活动的已报名学生（报名被取消的不算）
--     role   —— 拥有该角色的用户
--     format —— **对该赛制有档案的人**（产品负责人 2026-09-29 确认）：
--               学生：student_format_profiles 里有该赛制记录
--               裁判：judge_format_qualifications 里已获该赛制资格
--
--   四类解释都**不比"全体"更宽**，因此即使将来要放宽，
--   也只是一条策略的修改，不会造成已发生的隐私暴露。
-- =============================================================================

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,

  -- 按规范使用 TEXT + CHECK，而不是枚举类型：
  -- 受众类型将来可能增加，改 CHECK 比改枚举类型的影响面小。
  audience_type text not null,

  event_id uuid references public.events(id),
  role public.app_role,
  format_id uuid references public.debate_formats(id),

  published_at timestamptz,
  expires_at timestamptz,

  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notices_audience_type_check
    check (audience_type in ('global', 'event', 'role', 'format')),

  -- 规范第 6.3 节的明文要求："保证与该受众类型相符的目标列被填充，
  -- 且无关的目标列必须为空"。逐类展开写成 CASE，比一堆 OR 更难写错。
  constraint notices_audience_targeting_check check (
    case audience_type
      when 'global' then event_id is null and role is null and format_id is null
      when 'event' then event_id is not null and role is null and format_id is null
      when 'role' then role is not null and event_id is null and format_id is null
      when 'format' then format_id is not null and event_id is null and role is null
    end
  ),

  -- 标题与正文不能是空白。规范只说 NOT NULL，但 NOT NULL 允许 '' 与 '   '，
  -- 那样会发出一个"看得见但读不懂"的空通知。
  constraint notices_title_not_blank check (btrim(title) <> ''),
  constraint notices_body_not_blank check (btrim(body) <> ''),

  -- 过期时间必须晚于发布时间。否则通知一发布就已经过期，属于无意义的数据。
  constraint notices_expiry_after_publish
    check (expires_at is null or published_at is null or expires_at > published_at)
);

comment on table public.notices is
  '站内通知。受众四类：global/event/role/format，见本迁移头部的可见范围说明。';
comment on column public.notices.published_at is
  'NULL = 草稿（只有管理员可见）；非 NULL 且 <= now() 时对目标人群可见。';

create trigger notices_set_updated_at
  before update on public.notices
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 索引
--
-- 只建真实会走的访问路径：
--   1. 用户读"我能看到的已发布通知"——按发布时间倒序取最近若干条；
--   2. 管理员按受众筛选；
--   3. 外键列建索引，避免删除父行时全表扫描（也是 Supabase 的常规建议）。
-- -----------------------------------------------------------------------------
create index notices_published_at_idx
  on public.notices (published_at desc)
  where published_at is not null;

create index notices_audience_idx
  on public.notices (audience_type, published_at desc);

create index notices_event_id_idx on public.notices (event_id) where event_id is not null;
create index notices_format_id_idx on public.notices (format_id) where format_id is not null;
create index notices_created_by_idx on public.notices (created_by);

-- -----------------------------------------------------------------------------
-- 权限
--
-- ⚠️ 必须显式 REVOKE anon：Phase 1 的 RLS 迁移里那句
--    "revoke all on all tables in schema public from anon" 只对**当时已存在**的表生效。
--    之后新建的表会被 Supabase 的默认权限重新授予 anon，
--    那样匿名访问就会变成"被 RLS 挡成 0 行"而不是"权限不足"——
--    结果虽然同样安全，但依赖了一个可被改动的默认值。
--    （这一点在 Phase 1 的 F-ALL-05 上已经吃过一次亏。）
-- -----------------------------------------------------------------------------
alter table public.notices enable row level security;

revoke all on public.notices from anon;
grant select, insert, update, delete on public.notices to authenticated;
grant all on public.notices to service_role;

-- -----------------------------------------------------------------------------
-- RLS 策略
-- -----------------------------------------------------------------------------

-- 管理员（俱乐部管理员 + 超级管理员）可以看全部，包括草稿与已过期。
-- 为什么管理员要能看到草稿：他们需要预览自己要发布的内容。
create policy notices_select_manager on public.notices
  for select to authenticated
  using (public.is_manager());

-- 其他已登录用户：只能看"已发布、未过期、且与自己相关"的通知。
create policy notices_select_audience on public.notices
  for select to authenticated
  using (
    published_at is not null
    and published_at <= now()
    and (expires_at is null or expires_at > now())
    and case audience_type
      when 'global' then true
      when 'role' then public.has_role(role)
      when 'event' then exists (
        select 1
        from public.registrations r
        join public.student_profiles sp on sp.id = r.student_id
        where r.event_id = notices.event_id
          and sp.profile_id = public.current_profile_id()
          and r.status <> 'cancelled'
      )
      when 'format' then
        exists (
          select 1
          from public.student_format_profiles sfp
          join public.student_profiles sp on sp.id = sfp.student_id
          where sfp.format_id = notices.format_id
            and sp.profile_id = public.current_profile_id()
        )
        or exists (
          select 1
          from public.judge_format_qualifications jfq
          join public.judge_profiles jp on jp.id = jfq.judge_id
          where jfq.format_id = notices.format_id
            and jfq.approved
            and jp.profile_id = public.current_profile_id()
        )
      else false
    end
  );

-- 只有管理员可以创建 / 修改 / 删除（规范第 4 节："Post notices" 仅 Manage 两档）。
-- 删除不允许用 WITH CHECK（DELETE 没有新值），因此策略只写 USING。
create policy notices_insert_manager on public.notices
  for insert to authenticated
  with check (public.is_manager());

create policy notices_update_manager on public.notices
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy notices_delete_manager on public.notices
  for delete to authenticated
  using (public.is_manager());
