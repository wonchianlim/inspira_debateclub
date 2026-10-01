-- =============================================================================
-- 20261001090200_visible_names.sql
--
-- 让"能看到某个人的姓名"这件事，在不暴露整行档案的前提下成立。
--
-- -----------------------------------------------------------------------------
-- 问题：RLS 是**行级**的，不是列级的
--
-- `profiles_select_own_or_staff` 的策略是 `id = auth.uid() or is_staff()`。
-- 也就是说：学生**只能读到自己的档案行**，别人的一行都读不到。
-- 这一条本身是对的（档案行里有邮箱、电话这类不该互相可见的东西）。
--
-- 但它顺带弄坏了两件**本来就该能用**的事：
--
--  1. **搭档请求看不到对方姓名**（真实缺陷）。
--     `lib/student/partners.ts` 用 PostgREST 的嵌入查询取
--     `student_profiles(... profiles(display_name))`。嵌入的每一行同样受 RLS 约束，
--     于是对方那一行被静默过滤成 NULL，`counterpartName` 落到兜底值「（同学）」。
--     也就是说：学生收到"邀请你搭档"时，**看不到是谁邀请他**。
--     而搭档功能全部的设计前提就是"把码发给对方，对方能看到你"
--     （界面上那句"你只能看到对方的姓名与学校"就是承诺）。
--     ⚠️ 这是本次实测出来的：以学生身份查，`partner_requests` 能看到 1 条，
--        但 `profiles` 与 `student_profiles` 各只看得到自己那 1 行。
--
--  2. **学生看不到本场裁判是谁**（2026-10-01 产品负责人决定要公开）。
--     规范 §8.7 把这件事留给 "anonymity policy"，负责人拍板：公开。
--
-- -----------------------------------------------------------------------------
-- 做法：两个**只返回姓名**的 SECURITY DEFINER 函数
--
-- 为什么不放宽 `profiles` 的策略：
--   RLS 只能按**行**过滤。放宽到"能读裁判那一行"就等于把裁判的**邮箱、电话**
--   一并交出去（`profiles` 行里有这些列）。这是本项目明文禁止的
--   （AGENTS.md："Never include … phone numbers, or personal email addresses"）。
--
-- 为什么不建一个"全员姓名"视图：
--   那等于给出可枚举的成员名单，而搭档功能刻意做成"没有可以浏览的同学名单"
--   （见 `PartnerSection` 里的说明）。因此姓名只能**按关系**给，
--   而且关系必须是数据库自己判断的，不能由调用方声明。
--
-- 因此两个函数各自回答一个问题，各自带自己的可见性条件：
--   * `my_partner_counterparts()` —— 只返回**与我有关**的搭档请求的对方姓名与学校；
--   * `my_published_ballot_judges()` —— 只返回**我参与的比赛**里已发布评分表的裁判姓名。
--
-- 两者都是 `security definer` + `set search_path = ''`（与项目里其它函数一致），
-- 并且只 SELECT 姓名/学校这两类列 —— 邮箱、电话永远不出现在返回值里。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 一、搭档请求的对方：姓名 + 学校
-- -----------------------------------------------------------------------------
create or replace function public.my_partner_counterparts()
returns table (request_id uuid, display_name text, school text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    p.display_name,
    sp.school
  from public.partner_requests r
  join public.student_profiles sp
    on sp.id = case
                 when r.requester_student_id = public.my_student_id() then r.requested_student_id
                 else r.requester_student_id
               end
  join public.profiles p on p.id = sp.profile_id
  where public.my_student_id() is not null
    and (
      r.requester_student_id = public.my_student_id()
      or r.requested_student_id = public.my_student_id()
    );
$$;

comment on function public.my_partner_counterparts() is
  '我参与的搭档请求里，对方的显示名与学校。只返回这两类列，不含邮箱/电话；关系由函数自己判断，调用方无法指定要谁的姓名。';

-- -----------------------------------------------------------------------------
-- 二、我已发布评分表的裁判姓名
-- -----------------------------------------------------------------------------
create or replace function public.my_published_ballot_judges()
returns table (ballot_id uuid, judge_display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, p.display_name
  from public.ballots b
  join public.judge_profiles jp on jp.id = b.judge_id
  join public.profiles p on p.id = jp.profile_id
  where b.status = 'published'
    and (
      public.is_manager()
      -- 只有**这场比赛里有我**才返回裁判姓名。
      -- ⚠️ 这比 `ballots_student_published` 那条策略更严：那条允许任何登录用户
      -- 读**任何**已发布的评分表（规范 §14.3 只要求挡住"未发布"）。
      -- 姓名比分数敏感，因此这里按"我参与的比赛"收窄，而不是跟着放宽。
      or exists (
        select 1
        from public.match_teams mt
        join public.team_members tm on tm.team_id = mt.team_id
        join public.participations pa on pa.id = tm.participation_id
        where mt.match_id = b.match_id
          and pa.student_id = public.my_student_id()
      )
    );
$$;

comment on function public.my_published_ballot_judges() is
  '我参与的比赛里、已发布评分表的裁判显示名。学生只能拿到自己参与过的比赛；管理员可以拿到全部。';

-- -----------------------------------------------------------------------------
-- 三、授权
-- -----------------------------------------------------------------------------
-- `security definer` 函数默认对 public 可执行，这里显式收口到 authenticated，
-- 避免匿名角色也能调用（它内部虽然拿不到 my_student_id()，但没必要开放）。
revoke all on function public.my_partner_counterparts() from public, anon;
revoke all on function public.my_published_ballot_judges() from public, anon;
grant execute on function public.my_partner_counterparts() to authenticated;
grant execute on function public.my_published_ballot_judges() to authenticated;
