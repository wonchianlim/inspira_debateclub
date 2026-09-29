-- =============================================================================
-- 20260929090000_extensions_and_helpers.sql
--
-- 通用辅助函数与扩展。
--
-- 放在最前面，因为后续迁移都依赖它们。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at 自动维护
--
-- 第 6 章要求"所有可变表都有 created_at / updated_at"。与其在每个写入点手工赋值
-- （容易漏），不如用触发器统一保证。
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  '触发器函数：在任何 UPDATE 时把 updated_at 置为当前时间。';

-- -----------------------------------------------------------------------------
-- 当前登录用户的档案 id
--
-- 统一入口。所有策略与函数都通过它取当前用户，而不是散落各处直接调用 auth.uid()，
-- 这样将来若更换认证实现，只需改这一处。
--
-- 说明：这里**不**使用 SECURITY DEFINER —— 它只是对 auth.uid() 的包装，
-- 本身不读取任何受 RLS 保护的表，因此没有提权需要。
-- -----------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

comment on function public.current_profile_id() is
  '返回当前登录用户的 profile id（等价于 auth.uid()）。所有权限判断的统一入口。';

-- -----------------------------------------------------------------------------
-- 关于 btree_gist 扩展
--
-- 第 6.5 节要求"防止一个裁判被指派到时间重叠的两场比赛"，这需要 PostgreSQL 的
-- 排他约束（EXCLUDE USING gist），因此需要 btree_gist 扩展。
--
-- 但该约束作用在 judge_assignments 表上，属于后续阶段（Phase 5）。
-- 按 AGENTS.md 的 Scope Discipline（不提前实现后续阶段），本迁移**不**创建该扩展；
-- 将在创建 judge_assignments 的迁移中一并创建。
-- 已验证本机 PostgreSQL 17.6 提供 btree_gist 1.7。
-- -----------------------------------------------------------------------------
