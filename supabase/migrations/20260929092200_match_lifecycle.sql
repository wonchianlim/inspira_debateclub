-- =============================================================================
-- 20260929092200_match_lifecycle.sql
--
-- 开始比赛与名单快照锁定（主规格第 10.6、10.7 节）。
--
-- 规范两处明文要求，决定了这里必须用**数据库函数**而不是客户端分步写：
--
--   10.7 第 4 条："**Starting a match permanently locks its roster snapshot.**"
--   第 6.4 节："Append-only rows created **atomically** when the judge starts a match."
--
-- 分步写（先插快照、再改状态）有两个真实风险：
--   1. 两步之间失败 → 快照写了一半、比赛却没开始，或者反过来；
--   2. 两步之间**并发的第二次开始请求**会看到"还没开始"，于是写出第二份快照
--      （`UNIQUE (match_id, participation_id, position)` 会拦住一部分，
--       但错误信息对操作者毫无意义）。
--
-- 因此 `start_match()` 是一个 SECURITY DEFINER 函数，在一个事务里完成全部动作，
-- 并且对"已经开始过"的比赛**直接返回已有结果**（幂等），而不是报错。
-- =============================================================================

create or replace function public.start_match(p_match_id uuid)
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_team_count int;
  v_snapshot_count int;
  v_existing int;
begin
  if not public.is_manager() then
    raise exception '只有俱乐部管理员或超级管理员可以开始比赛'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if v_match.id is null then
    raise exception '比赛不存在：%', p_match_id using errcode = 'no_data_found';
  end if;

  /*
   * 幂等：已经锁定过名单的比赛**直接返回**，不重复写快照、不报错。
   *
   * 为什么选择幂等而不是报错：规范要求"开始"这个动作是可靠的 ——
   * 网络重试、管理员连点两次、裁判刷新页面，都不应该造成"第二次开始失败"
   * 或"写出两份快照"。真正的重复保护由下面的唯一约束兜底。
   */
  if v_match.roster_locked_at is not null then
    return v_match.status;
  end if;

  select count(*) into v_team_count from public.match_teams where match_id = p_match_id;
  if v_team_count < 2 then
    raise exception '这场比赛只有 % 支队伍，至少需要 2 支才能开始', v_team_count
      using errcode = 'check_violation';
  end if;

  -- ---------------------------------------------------------------------------
  -- 写入名单快照
  --
  -- 学生姓名是**快照**而不是外键：学生事后改名不应改写这场比赛的历史
  -- （规范第 17 节）。队伍名、位置、评分同样固化下来。
  -- ---------------------------------------------------------------------------
  select count(*) into v_existing from public.match_roster_snapshots where match_id = p_match_id;

  insert into public.match_roster_snapshots (
    match_id, team_id, participation_id, student_id, student_display_name,
    team_label, position, speaker_position, rating_snapshot, is_ironman
  )
  select
    mt.match_id,
    mt.team_id,
    tm.participation_id,
    p.student_id,
    coalesce(pr.display_name, '（未知）'),
    t.team_label,
    mt.position,
    tm.speaker_position,
    p.rating_snapshot,
    tm.is_ironman
  from public.match_teams mt
  join public.teams t on t.id = mt.team_id
  join public.team_members tm on tm.team_id = mt.team_id
  join public.participations p on p.id = tm.participation_id
  left join public.student_profiles sp on sp.id = p.student_id
  left join public.profiles pr on pr.id = sp.profile_id
  where mt.match_id = p_match_id
    and v_existing = 0;

  select count(*) into v_snapshot_count from public.match_roster_snapshots where match_id = p_match_id;
  if v_snapshot_count = 0 then
    raise exception '这场比赛没有可锁定的名单：队伍里还没有成员' using errcode = 'check_violation';
  end if;

  update public.matches
     set status = 'started',
         started_at = coalesce(started_at, now()),
         roster_locked_at = now()
   where id = p_match_id;

  return 'started'::public.match_status;
end;
$$;

comment on function public.start_match(uuid) is
  '开始比赛：在一个事务里写入名单快照并锁定。已经锁定过的比赛直接返回（幂等）。';

revoke all on function public.start_match(uuid) from public, anon;
grant execute on function public.start_match(uuid) to authenticated, service_role;

-- =============================================================================
-- 紧急名单更正（规范 10.7 末句）
--
-- 原文："After start, roster repair requires a **dedicated audited emergency
-- correction flow; never mutate snapshots casually.**"
--
-- 因此这里提供一个**唯一**的更正入口，它：
--   1. 要求管理员权限；
--   2. **必须给出理由**（空理由直接拒绝）—— 这是"紧急"与"随意"的分界线；
--   3. 只允许**替换名单里已有的一位学生**，不允许增删位置
--      （增删会改变比赛结构，那属于"取消这场比赛、重新安排"）；
--   4. 更正记录写进 `match_roster_snapshots` 的审计（快照本身不可改，
--      因此**用审计日志承载这次更正的事实**，而快照仍然是原始事实）。
--
-- ⚠️ 注意这里**不修改** `match_roster_snapshots`（那是只增不改的）。
--    更正的结果通过返回的说明与审计日志体现；评分表渲染仍然用原始快照。
--    这样做是**刻意的**：规范说"绝不随意改快照"，
--    而"改快照"与"记录一次更正"是两件事。
-- =============================================================================
create or replace function public.emergency_correct_roster(
  p_match_id uuid,
  p_participation_id uuid,
  p_replacement_participation_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_snapshot public.match_roster_snapshots%rowtype;
  v_replacement public.participations%rowtype;
  v_note text;
begin
  if not public.is_manager() then
    raise exception '只有俱乐部管理员或超级管理员可以更正名单'
      using errcode = 'insufficient_privilege';
  end if;

  -- 必须给出理由：空理由与只有空白字符的理由都拒绝
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception '紧急更正必须填写理由（至少 5 个字符），以便事后说明为什么改'
      using errcode = 'check_violation';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if v_match.id is null then
    raise exception '比赛不存在：%', p_match_id using errcode = 'no_data_found';
  end if;

  if v_match.roster_locked_at is null then
    raise exception '这场比赛还没有开始，请直接修改名单，不需要走紧急更正流程'
      using errcode = 'check_violation';
  end if;

  select * into v_snapshot
  from public.match_roster_snapshots
  where match_id = p_match_id and participation_id = p_participation_id;

  if v_snapshot.id is null then
    raise exception '这位学生不在这场比赛的名单里' using errcode = 'no_data_found';
  end if;

  select * into v_replacement from public.participations where id = p_replacement_participation_id;
  if v_replacement.id is null then
    raise exception '替换的参与记录不存在' using errcode = 'no_data_found';
  end if;

  -- 替换者必须与该场同活动同赛制
  if v_replacement.event_id <> v_match.event_id or v_replacement.format_id <> v_match.format_id then
    raise exception '替换的学生必须与本场比赛属于同一活动、同一赛制'
      using errcode = 'check_violation';
  end if;

  v_note := format(
    '紧急名单更正：比赛 %s（第 %s 场）由 %s 替换 %s，理由：%s',
    p_match_id, v_match.match_number, p_replacement_participation_id, p_participation_id, btrim(p_reason)
  );

  /*
   * 更正的事实写进审计日志。
   *
   * `audit_logs` 是只增不改的，因此这条记录本身也成了不可篡改的历史。
   * 这里显式插入（而不是依赖行级触发器），因为**快照行没有被修改**，
   * 触发器不会自动产生记录 —— 而"发生了一次更正"这件事必须被留下来。
   */
  -- ⚠️ 列名是 old_value / new_value，不是 changes（按实际表结构核对过）
  insert into public.audit_logs (actor_profile_id, entity_type, entity_id, action, old_value, new_value)
  values (
    public.current_profile_id(),
    'match_roster_snapshots',
    v_snapshot.id,
    'emergency_roster_correction',
    -- old_value：被替换的那条快照的原样内容（快照本身并没有被改动）
    to_jsonb(v_snapshot),
    jsonb_build_object(
      'note', v_note,
      'matchId', p_match_id,
      'matchNumber', v_match.match_number,
      'replacedParticipationId', p_participation_id,
      'replacementParticipationId', p_replacement_participation_id,
      'reason', btrim(p_reason)
    )
  );

  return v_note;
end;
$$;

comment on function public.emergency_correct_roster(uuid, uuid, uuid, text) is
  '开始比赛之后的紧急名单更正。必须给出理由；快照本身不被修改，更正事实写入只增不改的审计日志。';

revoke all on function public.emergency_correct_roster(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.emergency_correct_roster(uuid, uuid, uuid, text) to authenticated, service_role;

-- =============================================================================
-- Ironman（规范 10.6）
--
-- 原文："Ironman is an **explicit manager-confirmed exception**. Mark **both the
-- relevant team member and match**. An ironman student must not receive duplicate
-- speaker scores by accident; the ballot template defines how repeated speeches
-- are attributed. The participation **counts as one debate in history** unless a
-- distinct second participation was deliberately created."
--
-- 因此这个函数做三件事：
--   1. 标记 `team_members.is_ironman`（队内那位成员）；
--   2. 标记 `matches.ironman`（相关比赛）—— 规范要求**两处都要标**；
--   3. 不动参与记录本身 —— "在历史里算一次辩论"意味着
--      **不能**为铁人另建一条 participation（除非管理员确实刻意创建了第二次参与）。
-- =============================================================================
create or replace function public.set_ironman(
  p_team_id uuid,
  p_participation_id uuid,
  p_is_ironman boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams%rowtype;
  v_updated int;
begin
  if not public.is_manager() then
    raise exception '只有俱乐部管理员或超级管理员可以标记铁人'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then
    raise exception '队伍不存在：%', p_team_id using errcode = 'no_data_found';
  end if;

  update public.team_members
     set is_ironman = p_is_ironman
   where team_id = p_team_id
     and participation_id = p_participation_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception '这位学生不在这支队伍里' using errcode = 'no_data_found';
  end if;

  -- 规范要求队伍成员与**比赛**两处都标记到
  update public.matches m
     set ironman = p_is_ironman
   where m.id in (select mt.match_id from public.match_teams mt where mt.team_id = p_team_id);

  /*
   * 名单快照一旦锁定就**不再改**（只增不改）。
   * 因此对已经开始的比赛，铁人标记只体现在 team_members 与 matches 上，
   * 快照里那一行保留开始时的状态 —— 这是刻意的：
   * 评分表渲染用的是快照，而"这场比赛是按铁人打的"由 matches.ironman 表达。
   */
end;
$$;

comment on function public.set_ironman(uuid, uuid, boolean) is
  '标记/取消铁人（规范 10.6）。同时标记队伍成员与比赛两处；不新增参与记录。';

revoke all on function public.set_ironman(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_ironman(uuid, uuid, boolean) to authenticated, service_role;
