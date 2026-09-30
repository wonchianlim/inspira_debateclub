-- =============================================================================
-- 20260929092400_event_match_settings.sql
--
-- 比赛时间与房间改成**可配置**（Phase 5 完成报告里标记的 L-7）。
--
-- 背景：Phase 5 生成比赛时用了**保守默认值** ——
-- 房间从 `A101` 起顺序分配、时间从"三天后"起每场隔 60 分钟。
-- 规范第 15 节只要求"分配房间与时间"，**没有规定这些值应该是多少**，
-- 因此当时把它们写在代码里，并在完成报告里标出"这是最可能需要产品负责人补决定的地方"。
--
-- 产品负责人已明确要求："希望比赛时间和房间能自己设置"。
-- 本迁移把这三项做成**活动级配置**：
--   - `match_start_at`：第一场比赛从几点开始（为空则用活动开始时间）；
--   - `match_interval_minutes`：每场之间隔多少分钟；
--   - `room_names`：这场活动用哪些房间（为空则退回 A101 起的默认）。
--
-- ⚠️ 默认值刻意保持"和以前完全一样"（空 = 原行为），
--    这样已有活动的生成结果不会因为这次改动而悄悄变化。
-- =============================================================================

alter table public.events
  add column match_start_at timestamptz,
  add column match_interval_minutes smallint not null default 60,
  add column room_names text[] not null default '{}'::text[];

comment on column public.events.match_start_at is
  '第一场比赛的开始时间。为空时使用 events.starts_at。';
comment on column public.events.match_interval_minutes is
  '相邻两场比赛相隔多少分钟。默认 60，与 Phase 5 的旧行为一致。';
comment on column public.events.room_names is
  '本活动使用的房间名，按生成顺序依次分配。为空时退回默认（A101 起）。';

-- -----------------------------------------------------------------------------
-- 约束
-- -----------------------------------------------------------------------------
alter table public.events
  add constraint events_match_interval_range
    check (match_interval_minutes between 5 and 600);

alter table public.events
  add constraint events_room_names_not_blank
  check (not ('' = any (room_names)) and not (array_position(room_names, null) is not null));

/*
 * 刻意**不**用 CHECK 去重：CHECK 不能写子查询，硬凑会变成难读又易错的表达式。
 * 重复的房间名会被 `matches` 上的 `UNIQUE (event_id, room_name)` 拦住 ——
 * 那正是我们想要的保护，只是错误信息需要应用层翻译成人话。
 * 应用层在保存配置时也会先去重，因此正常情况下走不到那一步。
 */

comment on constraint events_room_names_not_blank on public.events is
  '房间名不能为空字符串。重复的房间名由 matches 的唯一约束兜底。';
