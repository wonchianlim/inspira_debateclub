-- =============================================================================
-- 20260929091900_participations_and_teams.sql
--
-- 参与、队伍与队伍成员（主规格第 6.4 节）。
--
-- Phase 4 的配对引擎需要落库的结构。比赛与正反方属于 Phase 5，本迁移不涉及。
--
-- 三张表的关系：
--   events ─┬─ participations（谁、在哪个赛制、第几次参与、评分快照）
--           └─ teams ── team_members ── participations
--
-- 关键不变式（规范第 6.4 节的明文要求）：
--   1. 一个人在同一活动里可以有**多于一次**参与（额外场次），因此唯一约束是
--      (event_id, student_id, participation_number)，**不是** (event_id, student_id)；
--   2. 一个 participation 最多只能在一支**未解散**的队伍里；
--   3. 队伍与参与的活动、赛制必须一致。
--
-- 第 2、3 条是**跨表**约束，CHECK 做不到，因此用触发器。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 枚举
-- -----------------------------------------------------------------------------
create type public.entitlement_type as enum (
  'weekly_entitlement',   -- 本周正常的一次参与
  'extra_paid',           -- 额外场次（已付费）
  'extra_complimentary',  -- 额外场次（赠送）
  'extra_payment_pending' -- 额外场次（待付款）
);

create type public.participation_status as enum (
  'proposed', 'confirmed', 'completed', 'cancelled'
);

create type public.team_status as enum (
  'proposed', 'confirmed', 'dissolved'
);

comment on type public.entitlement_type is
  '参与名额类型。规范第 10.2 节第 6 条：只有在明确选择了额外场次时才分配额外辩论。';

-- -----------------------------------------------------------------------------
-- participations
-- -----------------------------------------------------------------------------
create table public.participations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  student_id uuid not null references public.student_profiles (id),
  format_id uuid not null references public.debate_formats (id),

  -- 第几次参与。1 = 本周正常的一次；2、3… 是额外场次。
  participation_number smallint not null default 1,
  entitlement_type public.entitlement_type not null default 'weekly_entitlement',

  -- ⚠️ 评分**快照**：配对用的是这个值，而不是学生当前的评分。
  --    规范第 17 节要求"绝不让当前的档案改动重写已完成的辩论"，
  --    快照是那条要求在数据层的第一步。
  rating_snapshot smallint not null,

  status public.participation_status not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint participations_number_positive check (participation_number > 0),
  constraint participations_rating_range check (rating_snapshot between 1 and 10),

  -- 规范明确要求用三元组做唯一，而**不是** (event_id, student_id)：
  -- 一个人在同一活动里可以有多于一次的参与。
  constraint participations_event_student_number_key
    unique (event_id, student_id, participation_number)
);

comment on table public.participations is
  '某人在某活动某赛制上的一次参与。评分是快照，不随学生档案变化。';

create trigger participations_set_updated_at
  before update on public.participations
  for each row execute function public.set_updated_at();

create index participations_event_idx on public.participations (event_id);
create index participations_student_idx on public.participations (student_id);
create index participations_format_idx on public.participations (event_id, format_id);

-- -----------------------------------------------------------------------------
-- teams
-- -----------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  format_id uuid not null references public.debate_formats (id),
  team_label text,
  status public.team_status not null default 'proposed',
  -- 队伍平均评分。可为空：队伍还没排满时算不出来。
  average_rating numeric(4, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.teams is
  '配对产生的队伍。proposed = 系统提案（学生看不到）；confirmed = 管理员已确认。';

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create index teams_event_format_idx on public.teams (event_id, format_id);

-- -----------------------------------------------------------------------------
-- team_members
-- -----------------------------------------------------------------------------
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id),
  participation_id uuid not null references public.participations (id),
  speaker_position smallint,
  is_ironman boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint team_members_speaker_position_positive
    check (speaker_position is null or speaker_position > 0),

  constraint team_members_team_participation_key unique (team_id, participation_id),
  constraint team_members_team_position_key unique (team_id, speaker_position)
);

comment on table public.team_members is
  '队伍成员。一个 participation 最多在一支未解散的队伍里（由触发器强制，见下）。';

create trigger team_members_set_updated_at
  before update on public.team_members
  for each row execute function public.set_updated_at();

create index team_members_participation_idx on public.team_members (participation_id);
create index team_members_team_idx on public.team_members (team_id);

-- -----------------------------------------------------------------------------
-- 跨表不变式
--
-- 规范第 6.4 节末句："Server logic must ensure a participation is on at most one
-- non-dissolved team and team/event/format values agree."
--
-- 这两条都是跨表约束，CHECK 做不到：
--   - "未解散"是**另一张表**（teams）的列，部分唯一索引引用不到；
--   - "活动与赛制一致"要同时读 teams 与 participations。
-- 因此用触发器在数据库层强制，而不是只靠应用代码自觉。
--
-- 为什么值得放在数据库层：配对会反复增删队伍成员，一旦出现"同一个人在两支
-- 活着的队伍里"，后续的比赛与评分表都会跟着错，而且很难事后发现。
-- -----------------------------------------------------------------------------
create or replace function public.enforce_team_member_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_event uuid;
  v_team_format uuid;
  v_team_status public.team_status;
  v_part_event uuid;
  v_part_format uuid;
begin
  select t.event_id, t.format_id, t.status
    into v_team_event, v_team_format, v_team_status
  from public.teams t
  where t.id = new.team_id;

  if v_team_event is null then
    raise exception '队伍不存在：%', new.team_id using errcode = 'foreign_key_violation';
  end if;

  select p.event_id, p.format_id
    into v_part_event, v_part_format
  from public.participations p
  where p.id = new.participation_id;

  if v_part_event is null then
    raise exception '参与记录不存在：%', new.participation_id
      using errcode = 'foreign_key_violation';
  end if;

  -- 不变式 3：活动与赛制必须一致
  if v_team_event <> v_part_event or v_team_format <> v_part_format then
    raise exception '队伍与参与记录的活动/赛制必须一致（队伍 % / 参与 % %）',
      v_team_event, v_part_event, v_part_format
      using errcode = 'check_violation';
  end if;

  -- 不变式 2：一个参与最多在一支未解散的队伍里
  if v_team_status <> 'dissolved' then
    if exists (
      select 1
      from public.team_members tm
      join public.teams other on other.id = tm.team_id
      where tm.participation_id = new.participation_id
        and other.status <> 'dissolved'
        and tm.id <> new.id
    ) then
      raise exception '这位参与已经在另一支未解散的队伍里了'
        using errcode = 'unique_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_team_member_consistency() is
  '跨表不变式：队伍与参与的活动/赛制一致；一个参与最多在一支未解散队伍里。';

create trigger team_members_enforce_consistency
  before insert or update on public.team_members
  for each row execute function public.enforce_team_member_consistency();

/*
 * 只检查 team_members 还不够：把一支**已解散**的队伍改回 proposed/confirmed 时，
 * 它的成员可能已经在别的队伍里了 —— 那一瞬间就会出现"一个人在两支活队伍里"。
 * 因此队伍状态变化时也要重新检查它自己的全部成员。
 */
create or replace function public.enforce_team_status_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'dissolved' and old.status = 'dissolved' then
    if exists (
      select 1
      from public.team_members tm
      join public.team_members other on other.participation_id = tm.participation_id
      join public.teams other_team on other_team.id = other.team_id
      where tm.team_id = new.id
        and other.team_id <> new.id
        and other_team.status <> 'dissolved'
    ) then
      raise exception '这支队伍里有成员已经在别的未解散队伍里，不能恢复'
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger teams_enforce_status_members
  before update on public.teams
  for each row execute function public.enforce_team_status_members();

-- -----------------------------------------------------------------------------
-- 权限
--
-- ⚠️ 必须显式 REVOKE anon：Phase 1 那句"撤销 anon 对所有表的权限"
--    只对**当时已存在**的表生效，新建表会被默认权限重新授予 anon。
-- -----------------------------------------------------------------------------
alter table public.participations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

revoke all on public.participations from anon;
revoke all on public.teams from anon;
revoke all on public.team_members from anon;

grant select, insert, update, delete on public.participations to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;

grant all on public.participations to service_role;
grant all on public.teams to service_role;
grant all on public.team_members to service_role;

-- -----------------------------------------------------------------------------
-- RLS 策略
-- -----------------------------------------------------------------------------

-- 学生能看到**自己的**参与记录（那是他自己的数据）；管理员看全部。
create policy participations_select_own_or_staff on public.participations
  for select to authenticated
  using (student_id = public.my_student_id() or public.is_staff());

-- 参与由系统/管理员产生，学生不能自己创建或修改。
create policy participations_manage on public.participations
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

/*
 * 队伍与队伍成员在 Phase 4 **只有管理员能看到**。
 *
 * 为什么：Phase 4 产出的是**提案**（status = 'proposed'），
 * 学生看到"我可能和谁一队"会造成混乱与期待落空。规范把"发布分配"放在 Phase 5。
 * Phase 5 会在**已确认/已发布**的前提下加学生的只读策略，
 * 而不是现在就把草稿暴露出去。
 */
create policy teams_manage on public.teams
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy team_members_manage on public.team_members
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- -----------------------------------------------------------------------------
-- 审计
--
-- 三张表都由管理员/系统驱动，且都是配对的核心记录 ——
-- "谁把谁换出了哪支队伍"属于事后必须能解释清楚的事。
-- -----------------------------------------------------------------------------
do $attach$
declare
  t text;
  audited text[] := array['participations', 'teams', 'team_members'];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end
$attach$;
