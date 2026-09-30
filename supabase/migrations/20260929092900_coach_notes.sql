-- =============================================================================
-- 20260929092900_coach_notes.sql
--
-- 教练的私人笔记（主规格第 15 节 Phase 8："Coach student history and **private notes**"）。
--
-- -----------------------------------------------------------------------------
-- ⚠️ "私人"是私对谁？这是一个**必须做出来的判断**
--
-- 规范只说 "private notes"，没有说私对谁。三种可能：
--   (a) 只有这位教练能看到（连管理员也看不到）
--   (b) 教练与管理员能看到，学生看不到
--   (c) 除了学生，所有人都能看到
--
-- 我选了 **(a) 只有写笔记的教练自己能看到**，理由是：
--
--   教练笔记是**工作草稿**（"这个学生的反驳需要练"），不是机构记录。
--   一旦管理员能看，教练就会开始**为被看到而写**，笔记就失去了它最大的用处 ——
--   如实记下还不确定的观察。
--
-- 代价我也写在这里：**教练离职后这些笔记会变成孤儿数据**，
-- 管理员无法接手。如果产品负责人认为管理员应当能看（即选 b），
-- 改动很小（加一条 `or public.is_manager()`），但那是**产品决策而不是技术决策**，
-- 因此我没有替产品负责人做。
--
-- "教练能看哪些学生的历史"是同一类问题：目前**没有**教练与学生的关联表，
-- 因此这里只要求"学生存在"。若要限制成"只能写自己带的学生"，
-- 需要先有那张关联表 —— 那属于 Phase 9/10 的数据模型工作。
-- =============================================================================

create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.student_profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 空白笔记没有意义，而且会让"写了没有"变得无法判断
  constraint coach_notes_body_not_blank check (btrim(body) <> '')
);

comment on table public.coach_notes is
  '教练的私人笔记。**只有写笔记的教练本人可见**，管理员与学生都看不到 —— 见迁移顶部关于"私人是私对谁"的说明。';

create index coach_notes_coach_idx on public.coach_notes (coach_id);
create index coach_notes_student_idx on public.coach_notes (student_id);

create trigger coach_notes_set_updated_at
  before update on public.coach_notes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
--
-- ⚠️ `for all` 一条策略覆盖 SELECT/INSERT/UPDATE/DELETE，
--    并**同时**写 using 与 with check：只有 using 的话，
--    教练能把笔记的 coach_id 改成别人（改完之后自己就看不见了，但数据已经错了）。
-- -----------------------------------------------------------------------------
alter table public.coach_notes enable row level security;

create policy coach_notes_own on public.coach_notes
  for all to authenticated
  using (coach_id = public.current_profile_id())
  with check (coach_id = public.current_profile_id());

-- 服务角色绕过 RLS（Phase 1 的既有约定），因此不需要额外策略。

-- -----------------------------------------------------------------------------
-- ⚠️ 教练笔记**刻意不进审计日志** —— 这是一个需要解释的选择
--
-- Phase 1 的审计把整行的 old_value/new_value 记下来。
-- 对教练笔记来说，那等于把**私人正文**复制到另一张表里：
-- 管理员虽然在界面上看不到，却能在审计日志里读到。
-- 那样"私人"两个字就没有意义了。
--
-- 两条可能的做法都试过：
--   (a) 给 `body` 加进全局脱敏清单 —— **不行**：
--       `notices.body`（公告正文）也用了同一个列名，
--       加进去会把公告的审计内容一并抹掉，削弱的是**别处**的完整性保证。
--   (b) 让审计函数按表名区别对待 —— 可行，但要改 Phase 1 的审计函数，
--       而那是一个被 27 张表共用的函数。
--
-- 因此选了第三条：**教练笔记根本不挂审计触发器**。
--
-- 理由：审计的目的是**竞赛完整性**（谁改了分数、谁重开了评分表）。
-- 教练的私人工作笔记不属于这一类 —— 它是教练自己的草稿，
-- 改了、删了都只影响自己。为它保留审计，收益是零，代价是把私人内容
-- 复制到一个管理员可能读到的地方。
--
-- ⚠️ 代价写明：笔记的**增删改完全没有痕迹**。
--    如果产品负责人认为需要留痕，正确做法是 (b) ——
--    让审计函数按表名脱敏，而不是把 `body` 加进全局清单。
-- =============================================================================
