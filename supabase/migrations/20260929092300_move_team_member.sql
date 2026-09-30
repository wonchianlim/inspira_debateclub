-- =============================================================================
-- 20260929092300_move_team_member.sql
--
-- 把一位学生从一支队伍移到另一支（主规格第 10.7 节第 1 条）。
--
-- 规范原文："**Managers can always edit proposals before a match starts.**"
--
-- Phase 4 交付时只有"锁定 / 解散 / 重新生成"，**没有逐人移动** ——
-- 这是当时明确记录在完成报告 L-5 里的已知缺口。本迁移补上。
--
-- -----------------------------------------------------------------------------
-- 为什么用数据库函数
--
-- 移动一位成员要同时满足好几条**跨表**条件，任何一条不满足都必须整体拒绝：
--   - 源队伍里确实有这个人；
--   - 目标队伍与源队伍**同活动同赛制**（P4-1 的触发器已强制这一条）；
--   - 目标队伍**还有空位**（不能超过该赛制的 team_size）；
--   - 两支队伍的**比赛都还没有开始**（名单已锁定时不允许改，规范 10.7 第 1 条
--     只说"before a match starts"）；
--   - 目标队伍里不能已经有这个人。
--
-- 在应用层分步检查再写，会有"检查通过了、写的时候情况变了"的窗口；
-- 放在一个函数里则整体成功或整体失败。这与 P5-5 的 `start_match` 是同一个理由。
-- =============================================================================

create or replace function public.move_team_member(
  p_from_team_id uuid,
  p_participation_id uuid,
  p_to_team_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.teams%rowtype;
  v_to public.teams%rowtype;
  v_team_size smallint;
  v_target_count int;
  v_free_position smallint;
  v_locked int;
begin
  if not public.is_manager() then
    raise exception '只有俱乐部管理员或超级管理员可以调整队伍成员'
      using errcode = 'insufficient_privilege';
  end if;

  if p_from_team_id = p_to_team_id then
    raise exception '源队伍与目标队伍相同，不需要移动' using errcode = 'check_violation';
  end if;

  select * into v_from from public.teams where id = p_from_team_id;
  if v_from.id is null then
    raise exception '源队伍不存在' using errcode = 'no_data_found';
  end if;

  select * into v_to from public.teams where id = p_to_team_id;
  if v_to.id is null then
    raise exception '目标队伍不存在' using errcode = 'no_data_found';
  end if;

  if v_from.event_id <> v_to.event_id or v_from.format_id <> v_to.format_id then
    raise exception '只能在同一个活动、同一个赛制内移动队员'
      using errcode = 'check_violation';
  end if;

  if v_to.status = 'dissolved' then
    raise exception '目标队伍已经解散，不能把学生移进去' using errcode = 'check_violation';
  end if;

  -- 这个人确实在源队伍里
  if not exists (
    select 1 from public.team_members
    where team_id = p_from_team_id and participation_id = p_participation_id
  ) then
    raise exception '这位学生不在源队伍里' using errcode = 'no_data_found';
  end if;

  -- 目标队伍里不能已经有这个人
  if exists (
    select 1 from public.team_members
    where team_id = p_to_team_id and participation_id = p_participation_id
  ) then
    raise exception '这位学生已经在目标队伍里了' using errcode = 'unique_violation';
  end if;

  /*
   * 规范 10.7 第 1 条限定"**before a match starts**"。
   *
   * 因此只要两支队伍中任何一支所在的比赛已经锁定名单，就拒绝移动。
   * 开始之后的名单更正必须走 `emergency_correct_roster()`（P5-5）——
   * 那是一条**独立且必须给理由**的通道，不能从这条日常路径绕过去。
   */
  select count(*) into v_locked
  from public.match_teams mt
  join public.matches m on m.id = mt.match_id
  where mt.team_id in (p_from_team_id, p_to_team_id)
    and m.roster_locked_at is not null;

  if v_locked > 0 then
    raise exception '这两支队伍所在比赛的名单已经锁定，不能直接移动。如确需更正，请使用紧急名单更正流程'
      using errcode = 'check_violation';
  end if;

  -- 目标队伍是否有空位
  select f.team_size into v_team_size
  from public.debate_formats f where f.id = v_to.format_id;

  select count(*) into v_target_count
  from public.team_members where team_id = p_to_team_id;

  if v_team_size is not null and v_target_count >= v_team_size then
    raise exception '目标队伍已经满了（% 人），请先移出或解散其中一支', v_team_size
      using errcode = 'check_violation';
  end if;

  /*
   * 找一个空着的发言位。
   *
   * 不能直接沿用原来的 `speaker_position` —— 目标队伍里那个位置很可能已被占用，
   * 而 `UNIQUE (team_id, speaker_position)` 会直接拒绝。取"第一个没被占用的位置"。
   */
  select min(series.position)::smallint into v_free_position
  from generate_series(1, coalesce(v_team_size, 5)::int) as series(position)
  where not exists (
    select 1 from public.team_members tm
    where tm.team_id = p_to_team_id and tm.speaker_position = series.position
  );

  update public.team_members
     set team_id = p_to_team_id,
         speaker_position = v_free_position
   where team_id = p_from_team_id
     and participation_id = p_participation_id;

  /*
   * 审计由 `team_members` 上的行级触发器自动记录（P4-1 就挂上了），
   * 因此这里**不需要**手写审计插入 —— 上一条 UPDATE 已经产生记录。
   */
  return format('已把参与 %s 从队伍 %s 移到队伍 %s', p_participation_id, p_from_team_id, p_to_team_id);
end;
$$;

comment on function public.move_team_member(uuid, uuid, uuid) is
  '把一位学生从一支队伍移到同活动同赛制的另一支。名单已锁定（比赛已开始）时拒绝，须走紧急更正流程。';

revoke all on function public.move_team_member(uuid, uuid, uuid) from public, anon;
grant execute on function public.move_team_member(uuid, uuid, uuid) to authenticated, service_role;
