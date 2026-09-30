-- =============================================================================
-- 20260929092700_ballot_workflow.sql
--
-- 评分表的重开与发布（主规格第 15 节 Phase 7）。
--
-- 规范原文："**Reopen/resubmit/audit and publish workflow.**"
--
-- -----------------------------------------------------------------------------
-- 为什么状态机同时写在 TypeScript 与这里，而不是只写一处
--
-- 只写在应用层：任何绕过应用的写入（直接调 PostgREST）都能把一份评分表
-- 从 `draft` 直接改成 `published`，跳过提交与重开。
-- 只写在数据库层：界面无法知道该显示哪些按钮，只能靠试错。
--
-- 因此**两处都写**，并加一条**跨层测试**直接读这个迁移文件、与
-- `lib/domain/ballot-lifecycle.ts` 的清单比对 ——
-- 与 Phase 3 报名窗口那套做法一致（那份规则当时也写在两处）。
--
-- ⚠️ 下面 `allowed` 这个 VALUES 列表就是"事实来源"的一半。
--    改动它必须同时改 TypeScript，否则跨层测试会失败。
-- =============================================================================

create or replace function public.transition_ballot(
  p_ballot_id uuid,
  p_to public.ballot_status,
  p_reason text default null
)
returns public.ballot_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ballot public.ballots%rowtype;
  v_is_manager boolean;
  v_is_own_judge boolean;
  v_actor text;
  v_allowed boolean;
begin
  select * into v_ballot from public.ballots where id = p_ballot_id;
  if v_ballot.id is null then
    raise exception '评分表不存在' using errcode = 'no_data_found';
  end if;

  v_is_manager := public.is_manager();
  v_is_own_judge := exists (
    select 1 from public.judge_profiles jp
    where jp.id = v_ballot.judge_id
      and jp.profile_id = public.current_profile_id()
  );

  -- 决定"这次操作是谁做的"：管理员优先（管理员也可能同时是裁判）
  if v_is_manager then
    v_actor := 'manager';
  elsif v_is_own_judge then
    v_actor := 'judge';
  else
    raise exception '你不是这份评分表的裁判，也不是管理员'
      using errcode = 'insufficient_privilege';
  end if;

  -- ---------------------------------------------------------------------------
  -- 合法转换清单（**唯一事实来源的一半**，另一半在 ballot-lifecycle.ts）
  -- ---------------------------------------------------------------------------
  select exists (
    select 1
    from (values
      ('draft',      'submitted',  'judge'),
      ('reopened',   'resubmitted','judge'),
      ('submitted',  'reopened',   'manager'),
      ('resubmitted','reopened',   'manager'),
      ('submitted',  'published',  'manager'),
      ('resubmitted','published',  'manager')
    ) as allowed(from_status, to_status, actor)
    where allowed.from_status = v_ballot.status::text
      and allowed.to_status = p_to::text
      and allowed.actor = v_actor
  ) into v_allowed;

  if not v_allowed then
    /*
     * 错误信息要能直接显示给操作者。这里用中文说明**为什么**不行，
     * 而不是抛一个"状态转换非法"。
     */
    if v_ballot.status = 'published' then
      raise exception '这份评分表已经发布，不能直接修改。如需更正，请先重开。'
        using errcode = 'check_violation';
    end if;
    if p_to = 'reopened' and v_ballot.status = 'draft' then
      raise exception '这份评分表还是草稿，裁判可以自己继续填，不需要重开。'
        using errcode = 'check_violation';
    end if;
    if p_to = 'published' and v_ballot.status = 'draft' then
      raise exception '这份评分表还没有提交，不能发布。' using errcode = 'check_violation';
    end if;
    if p_to = 'published' and v_ballot.status = 'reopened' then
      raise exception '这份评分表已被重开，正在等裁判重新提交，现在不能发布。'
        using errcode = 'check_violation';
    end if;
    if p_to = 'submitted' and v_actor = 'manager' then
      raise exception '只有负责本场的裁判可以提交评分表。' using errcode = 'check_violation';
    end if;
    raise exception '不能从当前状态变到目标状态。' using errcode = 'check_violation';
  end if;

  -- 重开**必须给出理由** —— 这是"要求更正"与"随手改改"的分界线
  if p_to = 'reopened' and (p_reason is null or length(btrim(p_reason)) < 5) then
    raise exception '重开评分表必须填写理由（至少 5 个字符），以便事后说明为什么要改。'
      using errcode = 'check_violation';
  end if;

  -- ---------------------------------------------------------------------------
  -- 执行转换
  -- ---------------------------------------------------------------------------
  update public.ballots
     set status = p_to,
         reopened_at = case when p_to = 'reopened' then now() else reopened_at end,
         reopened_by = case when p_to = 'reopened' then public.current_profile_id() else reopened_by end,
         submitted_at = case when p_to = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
         resubmitted_at = case when p_to = 'resubmitted' then now() else resubmitted_at end,
         published_at = case when p_to = 'published' then now() else published_at end,
         published_by = case when p_to = 'published' then public.current_profile_id() else published_by end
   where id = p_ballot_id;

  /*
   * 审计由 `ballots` 上的行级触发器自动记录（P7-1 就挂上了），
   * 因此这里不需要手写 —— 上一条 UPDATE 已经产生记录，
   * 且 `audit_logs` 是只增不改的。
   */
  return p_to;
end;
$$;

comment on function public.transition_ballot(uuid, public.ballot_status, text) is
  '评分表状态转换（重开/重交/发布）。转换清单与 lib/domain/ballot-lifecycle.ts 一致，由跨层测试固定。重开必须给理由。';

revoke all on function public.transition_ballot(uuid, public.ballot_status, text) from public, anon;
grant execute on function public.transition_ballot(uuid, public.ballot_status, text) to authenticated, service_role;
