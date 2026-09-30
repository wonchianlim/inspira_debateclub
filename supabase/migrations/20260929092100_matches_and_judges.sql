-- =============================================================================
-- 20260929092100_matches_and_judges.sql
--
-- 比赛、房间、正反方与裁判指派（主规格第 6.4 节末与第 6.5 节）。
--
-- Phase 5 需要的六张表与四个枚举。
--
-- 三条规范明文要求的、不显眼但很关键的地方：
--   1. `matches` 有 `UNIQUE (event_id, room_name)` —— 同一活动内房间不能重复。
--      重复房间会让现场两支队伍走错场地，而且很难事后发现；
--   2. **正反方不用数据库枚举**（规范第 6.4 节明文："Do not use one rigid
--      database enum for format-specific positions"）。PF/JWSD/WSDC/1v1 用
--      PROP/OPP，BP 用 OG/OO/CG/CO —— 由领域逻辑按赛制校验；
--   3. `match_roster_snapshots` **只增不改**：开始比赛时写入，之后任何档案/
--      队伍/评分的改动都不能重写它（规范第 17 节）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 枚举
-- -----------------------------------------------------------------------------
create type public.match_status as enum (
  'scheduled',
  'missing_participant',
  'ready',
  'started',
  'ballot_submitted',
  'published',
  'cancelled'
);

create type public.judge_availability_status as enum (
  'offered', 'approved', 'unavailable', 'assigned'
);

create type public.judge_assignment_role as enum ('chair', 'panelist');

create type public.judge_assignment_status as enum (
  'assigned', 'accepted', 'completed', 'cancelled'
);

-- -----------------------------------------------------------------------------
-- matches
-- -----------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  format_id uuid not null references public.debate_formats (id),
  match_number smallint not null,
  room_name text not null,
  meeting_url text,
  scheduled_start timestamptz not null,
  status public.match_status not null default 'scheduled',

  started_at timestamptz,
  ballot_submitted_at timestamptz,
  published_at timestamptz,
  -- 名单快照被锁定的时刻（规范 10.7 第 4 条：开始比赛时永久锁定）
  roster_locked_at timestamptz,
  ironman boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matches_number_positive check (match_number > 0),
  constraint matches_room_not_blank check (btrim(room_name) <> ''),

  constraint matches_event_format_number_key unique (event_id, format_id, match_number),
  -- ⚠️ 房间在同一活动内唯一：重复会让现场走错场地
  constraint matches_event_room_key unique (event_id, room_name)
);

comment on table public.matches is
  '一场比赛。正反方在 match_teams.position，取值由赛制决定（不是数据库枚举）。';

comment on column public.matches.roster_locked_at is
  '名单快照锁定的时刻。规范 10.7 第 4 条：开始比赛时永久锁定，之后不得随意修改。';

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

create index matches_event_idx on public.matches (event_id, format_id, match_number);
create index matches_scheduled_start_idx on public.matches (event_id, scheduled_start);

-- -----------------------------------------------------------------------------
-- match_teams
--
-- 刻意**不**给 position 加枚举或 CHECK 列举具体取值 ——
-- 规范明文要求按赛制在领域逻辑里校验（PF 用 PROP/OPP，BP 用 OG/OO/CG/CO）。
-- 这里只保证"非空"与"同一场比赛内不重复"。
-- -----------------------------------------------------------------------------
create table public.match_teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id),
  team_id uuid not null references public.teams (id),
  position text not null,
  result text,
  placement smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint match_teams_position_not_blank check (btrim(position) <> ''),
  constraint match_teams_placement_positive check (placement is null or placement > 0),

  constraint match_teams_match_team_key unique (match_id, team_id),
  constraint match_teams_match_position_key unique (match_id, position)
);

comment on column public.match_teams.position is
  '正反方位置。PF/JWSD/WSDC/1v1 用 PROP/OPP；BP 用 OG/OO/CG/CO。由领域逻辑按赛制校验。';

create trigger match_teams_set_updated_at
  before update on public.match_teams
  for each row execute function public.set_updated_at();

create index match_teams_match_idx on public.match_teams (match_id);
create index match_teams_team_idx on public.match_teams (team_id);

-- -----------------------------------------------------------------------------
-- match_roster_snapshots（只增不改）
--
-- 规范第 17 节："Never let a current profile/rating/team edit rewrite a
-- completed debate." 快照就是这条要求在数据层的实现：
-- 学生姓名、队伍名、位置、评分都在**开始比赛那一刻**固化下来，
-- 之后学生改名字、管理员调整队伍，都不会改变这场比赛的历史。
-- -----------------------------------------------------------------------------
create table public.match_roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id),
  team_id uuid not null references public.teams (id),
  participation_id uuid not null references public.participations (id),
  student_id uuid not null references public.student_profiles (id),
  -- 姓名是**快照**，不是外键：学生改名不应改写历史
  student_display_name text not null,
  team_label text,
  position text not null,
  speaker_position smallint,
  rating_snapshot smallint not null,
  is_ironman boolean not null,
  created_at timestamptz not null default now(),

  constraint roster_snapshot_rating_range check (rating_snapshot between 1 and 10),
  constraint roster_snapshot_speaker_position_positive
    check (speaker_position is null or speaker_position > 0),

  constraint roster_snapshots_match_participation_position_key
    unique (match_id, participation_id, position)
);

comment on table public.match_roster_snapshots is
  '比赛开始时的名单快照，只增不改。评分表渲染用它，避免事后改动重写历史。';

create index roster_snapshots_match_idx on public.match_roster_snapshots (match_id);

/*
 * 只增不改：撤销 UPDATE 与 DELETE 权限，并加触发器兜底。
 *
 * 与 `audit_logs` 同一套做法（Phase 1 定下的规矩）：
 * **权限层与触发器层各拦一道**。只靠权限，将来某次迁移不小心重新 GRANT 就会失守；
 * 只靠触发器，错误信息不如权限拒绝直白。
 */
revoke update, delete, truncate on public.match_roster_snapshots from authenticated, anon, service_role;

create or replace function public.prevent_roster_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception '比赛名单快照是只增不改的历史记录，不允许修改或删除'
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function public.prevent_roster_snapshot_mutation() is
  '防止名单快照被修改或删除。与撤销权限形成两道防线。';

create trigger roster_snapshots_immutable
  before update or delete on public.match_roster_snapshots
  for each row execute function public.prevent_roster_snapshot_mutation();

-- -----------------------------------------------------------------------------
-- match_motions
-- -----------------------------------------------------------------------------
create table public.match_motions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id),
  motion_text text not null,
  released_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint match_motions_text_not_blank check (btrim(motion_text) <> '')
);

create trigger match_motions_set_updated_at
  before update on public.match_motions
  for each row execute function public.set_updated_at();

create index match_motions_match_idx on public.match_motions (match_id);

-- -----------------------------------------------------------------------------
-- judge_event_availability
-- -----------------------------------------------------------------------------
create table public.judge_event_availability (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  judge_id uuid not null references public.judge_profiles (id),
  status public.judge_availability_status not null default 'offered',
  signed_up_at timestamptz not null default now(),
  approved_at timestamptz,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint judge_availability_event_judge_key unique (event_id, judge_id)
);

comment on table public.judge_event_availability is
  '裁判在某活动上的可用性。规范第 11 节要求候选必须"已批准且该活动可用"。';

create trigger judge_availability_set_updated_at
  before update on public.judge_event_availability
  for each row execute function public.set_updated_at();

create index judge_availability_event_idx on public.judge_event_availability (event_id, status);

-- -----------------------------------------------------------------------------
-- judge_assignments
-- -----------------------------------------------------------------------------
create table public.judge_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id),
  judge_id uuid not null references public.judge_profiles (id),
  role public.judge_assignment_role not null default 'chair',
  status public.judge_assignment_status not null default 'assigned',
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint judge_assignments_match_judge_key unique (match_id, judge_id)
);

comment on table public.judge_assignments is
  '裁判指派。规范第 6.5 节：V1 通常一位主裁，但结构上不能阻止将来加评委组。';

create trigger judge_assignments_set_updated_at
  before update on public.judge_assignments
  for each row execute function public.set_updated_at();

create index judge_assignments_match_idx on public.judge_assignments (match_id);
create index judge_assignments_judge_idx on public.judge_assignments (judge_id, status);

-- -----------------------------------------------------------------------------
-- 一个裁判不能同时被指派到时间冲突的两场比赛
--
-- 规范第 6.5 节末句："Prevent one active judge from being assigned to
-- simultaneous matches."
--
-- 这是**跨行、依赖时间**的约束，CHECK 与唯一索引都做不到：
-- "冲突"取决于两场比赛的 scheduled_start 是否重合（按比赛时长推断），
-- 因此必须用触发器在写入时查一次。
--
-- 简化处理：把"同一活动内 scheduled_start 相同的两场比赛"视为冲突。
-- 规范没有给出比赛时长，因此不擅自假设时长；同一时刻起算已经能挡住
-- 最常见的错误（把同一位裁判同时排到两场）。
-- -----------------------------------------------------------------------------
create or replace function public.prevent_conflicting_judge_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_event uuid;
begin
  -- 已取消的指派不占用裁判
  if new.status = 'cancelled' then
    return new;
  end if;

  select m.scheduled_start, m.event_id into v_start, v_event
  from public.matches m where m.id = new.match_id;

  if v_start is null then
    raise exception '比赛不存在：%', new.match_id using errcode = 'foreign_key_violation';
  end if;

  if exists (
    select 1
    from public.judge_assignments ja
    join public.matches other on other.id = ja.match_id
    where ja.judge_id = new.judge_id
      and ja.status <> 'cancelled'
      and ja.id <> new.id
      and other.event_id = v_event
      and other.scheduled_start = v_start
  ) then
    raise exception '这位裁判在同一时间已经被指派到另一场比赛了'
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

comment on function public.prevent_conflicting_judge_assignment() is
  '阻止同一裁判在同一时刻被指派到两场比赛。取消的指派不占用裁判。';

create trigger judge_assignments_no_time_conflict
  before insert or update on public.judge_assignments
  for each row execute function public.prevent_conflicting_judge_assignment();

-- -----------------------------------------------------------------------------
-- 权限与 RLS
--
-- ⚠️ 新表必须显式 REVOKE anon：Phase 1 那句只对当时已存在的表生效。
-- -----------------------------------------------------------------------------
alter table public.matches enable row level security;
alter table public.match_teams enable row level security;
alter table public.match_roster_snapshots enable row level security;
alter table public.match_motions enable row level security;
alter table public.judge_event_availability enable row level security;
alter table public.judge_assignments enable row level security;

revoke all on public.matches, public.match_teams, public.match_roster_snapshots,
  public.match_motions, public.judge_event_availability, public.judge_assignments
  from anon;

grant select, insert, update, delete on public.matches, public.match_teams,
  public.match_motions, public.judge_event_availability, public.judge_assignments
  to authenticated;
-- 名单快照：只给 SELECT（写入由服务端在开始比赛时完成，权限已被上面 revoke 掉）
grant select, insert on public.match_roster_snapshots to authenticated;

grant all on public.matches, public.match_teams, public.match_roster_snapshots,
  public.match_motions, public.judge_event_availability, public.judge_assignments
  to service_role;
-- service_role 也**不能**改名单快照（触发器会拦住，这里再收紧一次权限）
revoke update, delete, truncate on public.match_roster_snapshots from service_role;

-- -----------------------------------------------------------------------------
-- 策略
--
-- Phase 5 只做到"管理员编排 + 发布"。
-- 学生与裁判的读取范围按规范分阶段放开：
--   - 学生：**已发布**的比赛可以看（未发布的不该看到名单）；
--   - 裁判：只能看到**指派给自己**的比赛。
-- -----------------------------------------------------------------------------

-- 管理员：全部可读写
create policy matches_manage on public.matches
  for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy match_teams_manage on public.match_teams
  for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy match_motions_manage on public.match_motions
  for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy judge_availability_manage on public.judge_event_availability
  for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy judge_assignments_manage on public.judge_assignments
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- 名单快照：管理员可读（写入走服务端）
create policy roster_snapshots_manage_read on public.match_roster_snapshots
  for select to authenticated using (public.is_manager() or public.is_staff());

-- 学生：只能看**已发布**（或已提交评分表）的比赛
create policy matches_select_published on public.matches
  for select to authenticated
  using (status in ('published', 'ballot_submitted'));

create policy match_teams_select_published on public.match_teams
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_teams.match_id and m.status in ('published', 'ballot_submitted')
  ));

-- 学生：已发布比赛的名单快照可读
create policy roster_snapshots_select_published on public.match_roster_snapshots
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_roster_snapshots.match_id and m.status in ('published', 'ballot_submitted')
  ));

-- 裁判：能看到**指派给自己**的比赛，以及该比赛的名单与辩题
create policy matches_select_assigned_judge on public.matches
  for select to authenticated
  using (exists (
    select 1 from public.judge_assignments ja
    join public.judge_profiles jp on jp.id = ja.judge_id
    where ja.match_id = matches.id
      and jp.profile_id = public.current_profile_id()
      and ja.status <> 'cancelled'
  ));

create policy roster_snapshots_select_assigned_judge on public.match_roster_snapshots
  for select to authenticated
  using (exists (
    select 1 from public.judge_assignments ja
    join public.judge_profiles jp on jp.id = ja.judge_id
    where ja.match_id = match_roster_snapshots.match_id
      and jp.profile_id = public.current_profile_id()
      and ja.status <> 'cancelled'
  ));

create policy match_motions_select_published_or_judge on public.match_motions
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_motions.match_id and m.status in ('published', 'ballot_submitted')
    )
    or exists (
      select 1 from public.judge_assignments ja
      join public.judge_profiles jp on jp.id = ja.judge_id
      where ja.match_id = match_motions.match_id
        and jp.profile_id = public.current_profile_id()
        and ja.status <> 'cancelled'
    )
  );

-- 裁判：能看到自己的可用性记录
create policy judge_availability_select_own on public.judge_event_availability
  for select to authenticated
  using (exists (
    select 1 from public.judge_profiles jp
    where jp.id = judge_event_availability.judge_id
      and jp.profile_id = public.current_profile_id()
  ));

-- 裁判：自己的可用性可以自己登记（'offered'），批准仍由管理员做
create policy judge_availability_insert_own on public.judge_event_availability
  for insert to authenticated
  with check (exists (
    select 1 from public.judge_profiles jp
    where jp.id = judge_event_availability.judge_id
      and jp.profile_id = public.current_profile_id()
  ));

-- 裁判：能看到自己的指派
create policy judge_assignments_select_own on public.judge_assignments
  for select to authenticated
  using (exists (
    select 1 from public.judge_profiles jp
    where jp.id = judge_assignments.judge_id
      and jp.profile_id = public.current_profile_id()
  ));

-- -----------------------------------------------------------------------------
-- 审计
--
-- 规范 10.7 第 2 条要求每一次人工改动都被审计；10.6 要求 Ironman 是
-- "explicit, audited, manager-confirmed exception"。
-- 因此这六张表里除了**只增不改**的快照之外都要审计
-- （快照本身不可修改，它的写入由 matches 的 started_at 与审计记录共同体现）。
-- -----------------------------------------------------------------------------
do $attach$
declare
  t text;
  audited text[] := array[
    'matches', 'match_teams', 'match_motions',
    'judge_event_availability', 'judge_assignments'
  ];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end
$attach$;

-- 快照：只记录**新增**（它是历史，新增本身就是事件）
drop trigger if exists audit_match_roster_snapshots on public.match_roster_snapshots;
create trigger audit_match_roster_snapshots
  after insert on public.match_roster_snapshots
  for each row execute function public.audit_row_change();
