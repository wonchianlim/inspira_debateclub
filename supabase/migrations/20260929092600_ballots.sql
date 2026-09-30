-- =============================================================================
-- 20260929092600_ballots.sql
--
-- 评分表（主规格第 6.6 节）。
--
-- 规范最重要的一句话：
--   "Do **not** create five unrelated ballot systems. Use shared tables plus a
--    **versioned format-specific schema**."
--   "The JSON schema describes format-specific fields and required validation.
--    It is **configuration**, not a dumping ground for all ballot data."
--
-- 也就是说：**五种赛制的差异放在 `ballot_templates.schema`（JSONB）里，而不是五套表。**
-- 这条设计正好解决了一个实际困难 —— WSDC 打哪几项、PF 满分多少，
-- 是**辩论领域的数据**，必须由产品负责人配置，不能由我编进代码。
--
-- schema 的具体形状由 `lib/domain/ballot-schema.ts` 定义与校验
-- （规范没有规定形状，那是我的设计，已在那个文件里写明并标注可推翻）。
-- =============================================================================

create type public.ballot_status as enum (
  'draft', 'submitted', 'reopened', 'resubmitted', 'published'
);

create type public.review_request_status as enum (
  'open', 'reviewing', 'resolved', 'rejected'
);

-- -----------------------------------------------------------------------------
-- ballot_templates
-- -----------------------------------------------------------------------------
create table public.ballot_templates (
  id uuid primary key default gen_random_uuid(),
  format_id uuid not null references public.debate_formats (id),
  version integer not null,
  name text not null,
  -- 字段定义与校验规则。**这是配置，不是评分数据本身。**
  schema jsonb not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ballot_templates_version_positive check (version > 0),
  constraint ballot_templates_name_not_blank check (btrim(name) <> ''),
  constraint ballot_templates_format_version_key unique (format_id, version)
);

comment on table public.ballot_templates is
  '按赛制版本化的评分表模板。字段定义在 schema（JSONB）里，是配置而不是评分数据。';

create trigger ballot_templates_set_updated_at
  before update on public.ballot_templates
  for each row execute function public.set_updated_at();

create index ballot_templates_format_active_idx
  on public.ballot_templates (format_id, active);

-- -----------------------------------------------------------------------------
-- ballots
-- -----------------------------------------------------------------------------
create table public.ballots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id),
  judge_id uuid not null references public.judge_profiles (id),
  template_id uuid not null references public.ballot_templates (id),
  status public.ballot_status not null default 'draft',
  winner_team_id uuid references public.teams (id),
  reason_for_decision text,
  -- 整场级与队伍级的字段值放这里；学生逐项分放 ballot_scores
  format_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  reopened_at timestamptz,
  resubmitted_at timestamptz,
  published_at timestamptz,
  reopened_by uuid references public.profiles (id),
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 一位裁判在一场比赛里只有一份评分表
  constraint ballots_match_judge_key unique (match_id, judge_id)
);

comment on table public.ballots is
  '一位裁判对一场比赛的评分表。学生只在 status = published 之后能看到。';

create trigger ballots_set_updated_at
  before update on public.ballots
  for each row execute function public.set_updated_at();

create index ballots_match_idx on public.ballots (match_id);
create index ballots_judge_idx on public.ballots (judge_id, status);

-- -----------------------------------------------------------------------------
-- ballot_scores（按学生逐项分）
-- -----------------------------------------------------------------------------
create table public.ballot_scores (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  participation_id uuid not null references public.participations (id),
  -- 对应模板 schema 里的字段键（例如 content / speaker_points）
  score_type text not null,
  score_value numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ballot_scores_type_not_blank check (btrim(score_type) <> ''),
  constraint ballot_scores_ballot_participation_type_key
    unique (ballot_id, participation_id, score_type)
);

comment on column public.ballot_scores.score_type is
  '模板 schema 里的字段键。规范举的例子（WSDC content/style/strategy/total、PF speaker_points、BP speaker_score）只是举例，不是穷举。';

create trigger ballot_scores_set_updated_at
  before update on public.ballot_scores
  for each row execute function public.set_updated_at();

create index ballot_scores_ballot_idx on public.ballot_scores (ballot_id);
create index ballot_scores_participation_idx on public.ballot_scores (participation_id);

-- -----------------------------------------------------------------------------
-- ballot_feedback
-- -----------------------------------------------------------------------------
create table public.ballot_feedback (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  target_type text not null,
  target_id uuid,
  feedback_type text not null,
  feedback_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ballot_feedback_target_type_check
    check (target_type in ('student', 'team', 'match')),
  constraint ballot_feedback_type_check
    check (feedback_type in ('individual', 'team', 'overall')),
  constraint ballot_feedback_text_not_blank check (btrim(feedback_text) <> '')
);

comment on table public.ballot_feedback is
  '评语。规范要求校验 target_id 指向的是**该场**比赛里的对象（由下面的触发器强制）。';

create trigger ballot_feedback_set_updated_at
  before update on public.ballot_feedback
  for each row execute function public.set_updated_at();

create index ballot_feedback_ballot_idx on public.ballot_feedback (ballot_id);

-- -----------------------------------------------------------------------------
-- ballot_review_requests（学生对已发布评分表提出复核请求）
-- -----------------------------------------------------------------------------
create table public.ballot_review_requests (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id),
  requested_by_student_id uuid not null references public.student_profiles (id),
  reason text not null,
  status public.review_request_status not null default 'open',
  admin_response text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint review_requests_reason_not_blank check (btrim(reason) <> ''),
  -- 同一位学生对同一份评分表只能提一次
  constraint review_requests_ballot_student_key unique (ballot_id, requested_by_student_id)
);

create trigger review_requests_set_updated_at
  before update on public.ballot_review_requests
  for each row execute function public.set_updated_at();

create index review_requests_ballot_idx on public.ballot_review_requests (ballot_id);
create index review_requests_status_idx on public.ballot_review_requests (status);

-- -----------------------------------------------------------------------------
-- 评语的目标必须在本场比赛里
--
-- 规范第 6.6 节末句："Validate that target_id refers to an entity on the
-- ballot's match." —— 这是**跨表**校验（要同时读 ballots → matches →
-- match_teams / participations），CHECK 做不到，因此用触发器。
-- -----------------------------------------------------------------------------
create or replace function public.enforce_feedback_target_in_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid;
begin
  if new.target_id is null then
    return new;  -- 整场评语可以不带 target_id
  end if;

  select b.match_id into v_match_id from public.ballots b where b.id = new.ballot_id;
  if v_match_id is null then
    raise exception '评分表不存在：%', new.ballot_id using errcode = 'foreign_key_violation';
  end if;

  if new.target_type = 'student' then
    if not exists (
      select 1
      from public.match_teams mt
      join public.team_members tm on tm.team_id = mt.team_id
      join public.participations p on p.id = tm.participation_id
      where mt.match_id = v_match_id and p.student_id = new.target_id
    ) then
      raise exception '这位学生不在本场比赛的名单里' using errcode = 'check_violation';
    end if;
  elsif new.target_type = 'team' then
    if not exists (
      select 1 from public.match_teams mt
      where mt.match_id = v_match_id and mt.team_id = new.target_id
    ) then
      raise exception '这支队伍不在本场比赛里' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_feedback_target_in_match() is
  '校验评语的 target_id 指向的是该场比赛里的学生或队伍。';

create trigger ballot_feedback_target_in_match
  before insert or update on public.ballot_feedback
  for each row execute function public.enforce_feedback_target_in_match();

-- -----------------------------------------------------------------------------
-- 权限与 RLS
-- -----------------------------------------------------------------------------
alter table public.ballot_templates enable row level security;
alter table public.ballots enable row level security;
alter table public.ballot_scores enable row level security;
alter table public.ballot_feedback enable row level security;
alter table public.ballot_review_requests enable row level security;

revoke all on public.ballot_templates, public.ballots, public.ballot_scores,
  public.ballot_feedback, public.ballot_review_requests from anon;

grant select, insert, update, delete on public.ballots, public.ballot_scores,
  public.ballot_feedback, public.ballot_review_requests to authenticated;
-- 模板只由超管写；其他人读
grant select on public.ballot_templates to authenticated;
grant insert, update, delete on public.ballot_templates to authenticated;

grant all on public.ballot_templates, public.ballots, public.ballot_scores,
  public.ballot_feedback, public.ballot_review_requests to service_role;

-- 模板：所有登录用户可读（裁判要按模板填表），只有超级管理员可写
create policy ballot_templates_select_all on public.ballot_templates
  for select to authenticated using (true);

create policy ballot_templates_manage_super_admin on public.ballot_templates
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 评分表：管理员全部可读写；裁判读写自己的；学生**只读已发布的**
create policy ballots_manage on public.ballots
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy ballots_judge_own on public.ballots
  for all to authenticated
  using (exists (
    select 1 from public.judge_profiles jp
    where jp.id = ballots.judge_id and jp.profile_id = public.current_profile_id()
  ))
  with check (exists (
    select 1 from public.judge_profiles jp
    where jp.id = ballots.judge_id and jp.profile_id = public.current_profile_id()
  ));

/*
 * 学生只能看到**已发布**的评分表。
 * 规范第 14.3 节明文要求："students cannot read unpublished ballots"。
 * 他们没有 INSERT/UPDATE 权限（上面两条策略都不覆盖学生）。
 */
create policy ballots_student_published on public.ballots
  for select to authenticated
  using (status = 'published');

-- 逐项分与评语：跟随所属评分表的可见性
create policy ballot_scores_follow_ballot on public.ballot_scores
  for all to authenticated
  using (exists (
    select 1 from public.ballots b
    where b.id = ballot_scores.ballot_id
      and (
        public.is_manager()
        or b.status = 'published'
        or exists (
          select 1 from public.judge_profiles jp
          where jp.id = b.judge_id and jp.profile_id = public.current_profile_id()
        )
      )
  ))
  with check (exists (
    select 1 from public.ballots b
    where b.id = ballot_scores.ballot_id
      and (
        public.is_manager()
        or exists (
          select 1 from public.judge_profiles jp
          where jp.id = b.judge_id and jp.profile_id = public.current_profile_id()
        )
      )
  ));

create policy ballot_feedback_follow_ballot on public.ballot_feedback
  for all to authenticated
  using (exists (
    select 1 from public.ballots b
    where b.id = ballot_feedback.ballot_id
      and (
        public.is_manager()
        or b.status = 'published'
        or exists (
          select 1 from public.judge_profiles jp
          where jp.id = b.judge_id and jp.profile_id = public.current_profile_id()
        )
      )
  ))
  with check (exists (
    select 1 from public.ballots b
    where b.id = ballot_feedback.ballot_id
      and (
        public.is_manager()
        or exists (
          select 1 from public.judge_profiles jp
          where jp.id = b.judge_id and jp.profile_id = public.current_profile_id()
        )
      )
  ));

-- 复核请求：学生只能提自己的、且只能对**已发布**的评分表提；管理员全部可读写
create policy review_requests_student_own on public.ballot_review_requests
  for select to authenticated
  using (
    requested_by_student_id = public.my_student_id()
    or public.is_manager()
  );

create policy review_requests_student_insert on public.ballot_review_requests
  for insert to authenticated
  with check (
    requested_by_student_id = public.my_student_id()
    and exists (
      select 1 from public.ballots b
      where b.id = ballot_review_requests.ballot_id and b.status = 'published'
    )
  );

create policy review_requests_manage on public.ballot_review_requests
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- -----------------------------------------------------------------------------
-- 审计
--
-- 规范第 15 节 Phase 7 明文要求："Reopen/resubmit/audit and publish workflow."
-- 因此 ballots 必须被审计（重开、重交、发布都是要能说清楚的操作）。
-- 模板同样审计：改模板会影响之后所有裁判填表。
-- -----------------------------------------------------------------------------
do $attach$
declare
  t text;
  audited text[] := array['ballot_templates', 'ballots', 'ballot_review_requests'];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end
$attach$;
