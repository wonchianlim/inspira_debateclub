-- =============================================================================
-- 20260929093000_notice_reads.sql
--
-- 应用内通知中心：**每人每条的已读状态**（主规格第 15 节 Phase 9）。
--
-- 规范第 15 节 Phase 9 原文："Complete email job processing and templates.
-- **In-app notification center.** Retry/observability, rate limits, audit
-- coverage review."
--
-- `notices` 表（Phase 2 / P2-1）已经有了**通知本身**与受众定向，但没有
-- "这条我读过了没有" —— 没有它，通知中心只是一个每次都从头看一遍的列表。
--
-- -----------------------------------------------------------------------------
-- ⚠️ 刻意**不进审计**
--
-- Phase 1 的审计服务于**竞赛完整性**：谁改了分数、谁重开了评分表、谁动了名单。
-- "某人读过一条通知"不属于这一类 —— 它不是对竞赛数据的更改。
--
-- 而且它是**高频**写入：一次通知发给 60 个人就是 60 行。
-- 把它挂上审计会让审计日志被已读回执淹没，真正要查的记录反而被埋在下面。
-- **审计日志的价值取决于它能被读。**
--
-- ⚠️ 与之相对：这个判断**只**适用于读取回执。
--    任何**更改竞赛数据**的新表都应当挂审计，那是 Phase 1 定下的底线。
-- =============================================================================

create table public.notice_reads (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),

  -- 同一个人对同一条通知只应该有一条已读记录
  constraint notice_reads_unique unique (notice_id, profile_id)
);

comment on table public.notice_reads is
  '通知的已读回执。刻意不进审计 —— 它不是对竞赛数据的更改，且高频（一次通知 × 全部受众）。';

create index notice_reads_profile_idx on public.notice_reads (profile_id);

-- -----------------------------------------------------------------------------
-- RLS
--
-- 已读回执是**个人的**：只能看到、创建、删除自己的。
-- 管理员也**不需要**看别人读没读 —— 那会变成一种变相的"监督"，
-- 而规范从没要求通知要追踪到人。
-- -----------------------------------------------------------------------------
alter table public.notice_reads enable row level security;

create policy notice_reads_own on public.notice_reads
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());
