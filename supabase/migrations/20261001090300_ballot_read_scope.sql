-- =============================================================================
-- 20261001090300_ballot_read_scope.sql
--
-- 修一处**违反了已写明需求**的权限漏洞：已发布的评分表原来对所有登录用户可见。
--
-- -----------------------------------------------------------------------------
-- 问题
--
-- 原来的策略是：
--
--     create policy ballots_student_published on public.ballots
--       for select to authenticated using (status = 'published');
--
-- 它只实现了"未发布的看不到"（规范 §14.3），却**没有**实现"只看自己比赛的"。
-- 于是一名学生（其实任何登录用户）可以直接调接口读**别人比赛**的已发布评分表。
--
-- 而 `docs/permissions.md` 已经把要求写死了：
--
--   * 第 141 行：「学生只能读到已发布、**且自己在该场比赛名单中**的 ballot。」
--   * `F-STU-04`：「读取**自己未参加比赛**的已发布 ballot」→ **拒绝**
--   * `F-JDG-01/02`：「裁判读未被指派比赛的名单或 ballot」→ **拒绝**
--
-- 也就是说：这不是"要不要收紧"的取舍，而是**已经写在需求里、实现没做到**。
--
-- -----------------------------------------------------------------------------
-- 为什么现在才发现
--
-- 数据库用例里**根本没有 F-STU-04 这一条**（`F-STU-40` 覆盖的是"未发布"），
-- 而 `F-JDG-02`（裁判读未被指派的评分表）此前一直是**侥幸通过**：
-- 测试夹具里一份已发布的评分表都没有，于是"读不到"和"没有可读的"长得一模一样。
--
-- 本次为了验证"学生能看到本场裁判姓名"往夹具里加了一份**已发布**的评分表，
-- `F-JDG-02` 立刻从 PASS 变 FAIL —— 那个侥幸才暴露出来。
--
-- -----------------------------------------------------------------------------
-- 做法：把"谁能读这一份评分表"收成**一个函数**，三条策略共用
--
-- 读范围（`can_read_ballot`）：
--   * 管理员：全部；
--   * 被指派的裁判：自己那一份（含草稿）；
--   * **已发布**的评分表：教练/管理员等 staff 可以看（`docs/permissions.md` 第 147 行
--     写了教练能看到"所看学生"的已发布 ballot；在没有"教练↔学生"关系表之前，
--     这里用 `is_staff()`，与改动前的实际能力一致，不会让教练端突然变空）；
--   * 其余情况：必须是**这场比赛名单里的学生**。
--
-- 写范围（`can_write_ballot`）：管理员或被指派的裁判 —— 与改动前的 WITH CHECK 完全一致，
-- 一个字都没有放宽。学生仍然不能写（由 `F-STU-42` 固定）。
--
-- ⚠️ 三张表（ballots / ballot_scores / ballot_feedback）共用同一对函数，
--    而不是各写一遍三行 EXISTS：`docs/permissions.md` 第 148–149 行要求
--    "随 ballots 的可读性"，三份手抄的条件迟早会有一份跑偏。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 一、读 / 写两个判定函数
-- -----------------------------------------------------------------------------
create or replace function public.can_read_ballot(p_ballot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ballots b
    where b.id = p_ballot_id
      and (
        public.is_manager()
        or exists (
          select 1 from public.judge_profiles jp
          where jp.id = b.judge_id
            and jp.profile_id = public.current_profile_id()
        )
        or (
          b.status = 'published'
          and (
            public.is_staff()
            or exists (
              select 1
              from public.match_teams mt
              join public.team_members tm on tm.team_id = mt.team_id
              join public.participations pa on pa.id = tm.participation_id
              where mt.match_id = b.match_id
                and pa.student_id = public.my_student_id()
            )
          )
        )
      )
  );
$$;

comment on function public.can_read_ballot(uuid) is
  '谁能读这一份评分表：管理员 / 被指派裁判 / 已发布且（staff 或本场名单内的学生）。依据 docs/permissions.md 第 141、147 行与 F-STU-04、F-JDG-02。';

create or replace function public.can_write_ballot(p_ballot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ballots b
    where b.id = p_ballot_id
      and (
        public.is_manager()
        or exists (
          select 1 from public.judge_profiles jp
          where jp.id = b.judge_id
            and jp.profile_id = public.current_profile_id()
        )
      )
  );
$$;

comment on function public.can_write_ballot(uuid) is
  '谁能写这一份评分表：管理员或被指派的裁判。学生一律不能写。与改动前的 WITH CHECK 完全相同。';

-- -----------------------------------------------------------------------------
-- 二、替换三条读策略
-- -----------------------------------------------------------------------------
drop policy if exists ballots_student_published on public.ballots;
create policy ballots_select_in_scope on public.ballots
  for select to authenticated
  using (public.can_read_ballot(id));

-- 逐项分与评语：读随 `ballots`，写仍然是"管理员或被指派裁判"
drop policy if exists ballot_scores_follow_ballot on public.ballot_scores;
create policy ballot_scores_follow_ballot on public.ballot_scores
  for all to authenticated
  using (public.can_read_ballot(ballot_id))
  with check (public.can_write_ballot(ballot_id));

drop policy if exists ballot_feedback_follow_ballot on public.ballot_feedback;
create policy ballot_feedback_follow_ballot on public.ballot_feedback
  for all to authenticated
  using (public.can_read_ballot(ballot_id))
  with check (public.can_write_ballot(ballot_id));
