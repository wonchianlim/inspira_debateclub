-- =============================================================================
-- 20260929092000_pairing_proposals.sql
--
-- 配对提案的持久化（主规格第 10 节末句与 10.7）。
--
-- 规范对"可解释"的要求是明确的：
--   - 第 10.2 节末句："每一个不明显的分配都要产生一条说明取舍的警告"；
--   - 第 10.7 节："**重新生成必须保留已锁定/人工调整的分配**，
--     除非管理员明确选择解锁它们。"
--
-- 要做到这两点，系统必须记住**上次用的是哪一版算法、输入是什么、算出了什么、警告了什么**。
-- 只保存"结果"是不够的 —— 那样管理员看到一支队伍时无法知道它为什么长这样，
-- 而重新生成也无法判断"哪些是人工调过的、不能动"。
--
-- -----------------------------------------------------------------------------
-- 为什么不直接改 teams 表就完事
--
-- teams 是**当前状态**，提案是**一次生成的历史**。
-- 管理员可能生成多次、对比不同的方案；把输入快照与警告写进 teams 会把两者混在一起
-- （同一批输入会被重复存 N 份，而且无法表达"这一次生成整体如何"）。
-- 因此分开：`pairing_proposals` 记录一次生成，`teams` 通过外键指回产生它的那一次。
-- =============================================================================

create type public.pairing_proposal_status as enum (
  'draft',      -- 刚生成，管理员还在看
  'confirmed',  -- 管理员已确认（后续生成不再覆盖）
  'superseded'  -- 已被更新的一次生成取代
);

comment on type public.pairing_proposal_status is
  '提案状态。confirmed 之后重新生成不会动它，除非管理员明确解锁。';

create table public.pairing_proposals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),

  -- 算法版本。规范要求持久化它，否则历史提案会出现
  -- "同一个版本号对应两套算法"而变得无法解释。
  algorithm_version text not null,

  status public.pairing_proposal_status not null default 'draft',

  /*
   * 提案输入快照（JSONB）。
   *
   * 刻意**只存算法输入**：学生 id、评分、资格、可用性、已接受搭档、以前做过队友的人。
   * **不存姓名、邮箱、学校** —— 那些是个人信息，能通过 id 关联出来，
   * 没有必要在提案里再复制一份（复制一份就多一处需要清理与保护的地方）。
   */
  input_snapshot jsonb not null,

  /* 警告列表（JSONB 数组），每条含 code 与中文说明 */
  warnings jsonb not null default '[]'::jsonb,

  /* 汇总评分：总成本、各赛制人数等，便于比较不同方案 */
  summary jsonb not null default '{}'::jsonb,

  generated_by uuid references public.profiles (id),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pairing_proposals is
  '一次配对生成的输入快照、警告、评分与算法版本。用于解释结果与保护人工调整。';

comment on column public.pairing_proposals.input_snapshot is
  '仅含算法输入（学生 id、评分、资格、可用性、搭档与历史队友）。不含姓名/邮箱等个人信息。';

create trigger pairing_proposals_set_updated_at
  before update on public.pairing_proposals
  for each row execute function public.set_updated_at();

create index pairing_proposals_event_idx
  on public.pairing_proposals (event_id, generated_at desc);

-- -----------------------------------------------------------------------------
-- teams：补上"来自哪次生成"与"锁定/人工调整"标记
--
-- 规范 10.7 第 3 条："Regeneration must preserve locked/manual assignments
-- unless the manager explicitly chooses to unlock them."
-- 没有这两个标记就无法实现这条要求 —— 重新生成时无从判断哪些不能动。
-- -----------------------------------------------------------------------------
alter table public.teams
  add column proposal_id uuid references public.pairing_proposals (id) on delete set null,
  add column locked boolean not null default false,
  add column manually_edited boolean not null default false;

comment on column public.teams.locked is
  '管理员锁定。重新生成时必须保留，除非明确选择解锁。';

comment on column public.teams.manually_edited is
  '管理员手工调整过。重新生成时同样必须保留。';

create index teams_proposal_idx on public.teams (proposal_id);

-- -----------------------------------------------------------------------------
-- 权限与 RLS
--
-- ⚠️ anon 必须显式 REVOKE：Phase 1 那句"撤销 anon 权限"只对当时已存在的表生效，
--    新建表会被默认权限重新授予 anon。
-- -----------------------------------------------------------------------------
alter table public.pairing_proposals enable row level security;

revoke all on public.pairing_proposals from anon;
grant select, insert, update on public.pairing_proposals to authenticated;
grant all on public.pairing_proposals to service_role;

-- 提案是内部工作材料，学生与教练都不该看到草稿。只有管理员可读写。
create policy pairing_proposals_manage on public.pairing_proposals
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- -----------------------------------------------------------------------------
-- 审计
--
-- "谁在什么时候重新生成了提案、谁把哪支队伍锁了"属于事后必须能解释清楚的事。
-- -----------------------------------------------------------------------------
drop trigger if exists audit_pairing_proposals on public.pairing_proposals;
create trigger audit_pairing_proposals
  after insert or update or delete on public.pairing_proposals
  for each row execute function public.audit_row_change();
