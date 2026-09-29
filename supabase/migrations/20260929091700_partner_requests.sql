-- =============================================================================
-- 20260929091700_partner_requests.sql
--
-- 搭档请求（主规格第 6.3 节 `partner_requests`）与 `partner_request_status` 枚举。
--
-- Phase 1 建表时只建了 `registrations` 与 `registration_format_preferences`，
-- 规范里定义的 `partner_requests` 属于 Phase 3 的"学生搭档请求"，因此在这里补上。
--
-- 语义（规范第 9.2 节第 4 条与第 6.3 节末句）：
--   - 学生可以请求与另一位参与者搭档；
--   - **被接受的请求是"强烈偏好"，不是保证** —— 配对阶段仍可能因为
--     人数、赛制或评分平衡而无法满足。这一点会写在界面上，避免学生误以为"一定成"。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 枚举
-- -----------------------------------------------------------------------------
create type public.partner_request_status as enum (
  'pending',      -- 已发出，等待对方回应
  'accepted',     -- 对方已接受：配对时的强烈偏好
  'unavailable',  -- 对方表示无法搭档
  'replaced',     -- 管理员在配对时替换了这个搭档（Phase 4 使用）
  'cancelled'     -- 请求方撤回
);

comment on type public.partner_request_status is
  '搭档请求状态。pending/accepted 属于"有效请求"，其余为已结束。';

-- -----------------------------------------------------------------------------
-- 表
-- -----------------------------------------------------------------------------
create table public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  -- 允许为空：学生可以先发起搭档意向，等确定赛制后再补
  format_id uuid references public.debate_formats (id),
  requester_student_id uuid not null references public.student_profiles (id),
  requested_student_id uuid not null references public.student_profiles (id),
  status public.partner_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 规范明文要求：不能请求自己
  constraint partner_requests_not_self check (requester_student_id <> requested_student_id)
);

comment on table public.partner_requests is
  '搭档请求。被接受的请求是配对时的强烈偏好，但不是保证。';

create trigger partner_requests_set_updated_at
  before update on public.partner_requests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- "同一请求人 / 同一活动 / 同一赛制最多一条有效请求"
--
-- 规范第 6.3 节末句的明文要求。用**部分唯一索引**实现，只约束有效状态，
-- 而不是对所有状态建唯一 —— 否则一条请求被拒绝或撤回之后，
-- 学生就再也无法对同一个活动/赛制重新发起请求了。
--
-- ⚠️ `COALESCE(format_id, ...)` 是必需的，不是画蛇添足：
--    PostgreSQL 在唯一索引里把 NULL 视为**互不相等**，
--    因此若直接对可空的 format_id 建索引，"没有指定赛制"的重复请求不会被拦住。
--    这里用一个固定的哨兵 UUID 把 NULL 归一化，使"未指定赛制"也能被去重。
-- -----------------------------------------------------------------------------
create unique index partner_requests_active_unique
  on public.partner_requests (
    requester_student_id,
    event_id,
    coalesce(format_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('pending', 'accepted');

comment on index public.partner_requests_active_unique is
  '同一请求人在同一活动/赛制上最多一条有效（pending/accepted）请求。NULL 赛制用哨兵值归一化。';

-- -----------------------------------------------------------------------------
-- 索引（真实访问路径）
-- -----------------------------------------------------------------------------
create index partner_requests_event_idx on public.partner_requests (event_id);
create index partner_requests_requester_idx on public.partner_requests (requester_student_id);
create index partner_requests_requested_idx on public.partner_requests (requested_student_id);
create index partner_requests_format_idx on public.partner_requests (format_id)
  where format_id is not null;

-- -----------------------------------------------------------------------------
-- 权限
--
-- ⚠️ 必须显式 REVOKE anon：Phase 1 的那句"撤销 anon 对所有表的权限"
--    只对**当时已存在**的表生效，新建表会被 Supabase 的默认权限重新授予 anon。
-- -----------------------------------------------------------------------------
alter table public.partner_requests enable row level security;

revoke all on public.partner_requests from anon;
grant select, insert, update, delete on public.partner_requests to authenticated;
grant all on public.partner_requests to service_role;

-- -----------------------------------------------------------------------------
-- RLS 策略
-- -----------------------------------------------------------------------------

-- 请求方、被请求方、管理员都能看到
create policy partner_requests_select_involved on public.partner_requests
  for select to authenticated
  using (
    public.is_manager()
    or requester_student_id = public.my_student_id()
    or requested_student_id = public.my_student_id()
  );

-- 只能以**自己**的名义发起请求
create policy partner_requests_insert_own on public.partner_requests
  for insert to authenticated
  with check (
    public.is_manager()
    or requester_student_id = public.my_student_id()
  );

-- 双方都能更新：请求方可以撤回，被请求方可以接受/拒绝。
-- 管理员可以处理全部（Phase 4 的"替换搭档"）。
create policy partner_requests_update_involved on public.partner_requests
  for update to authenticated
  using (
    public.is_manager()
    or requester_student_id = public.my_student_id()
    or requested_student_id = public.my_student_id()
  )
  with check (
    public.is_manager()
    or requester_student_id = public.my_student_id()
    or requested_student_id = public.my_student_id()
  );

-- 只有管理员能删除（保留学生撤回的记录，用 cancelled 状态而不是删除）
create policy partner_requests_delete_manager on public.partner_requests
  for delete to authenticated
  using (public.is_manager());

-- -----------------------------------------------------------------------------
-- 审计
--
-- 把 `partner_requests` 与 `registrations` 加入审计触发器列表。
--
-- 为什么现在才加（P2-2 时刻意排除过它们）：
--   P2-2 的理由是"那是学生自助操作，不是特权改动"。到了 Phase 3，
--   这两张表的状态变化开始具有**后果**：`late_cancelled`（迟取消）与
--   `no_show`（未到场）会影响历史与信誉，`accepted`（已接受搭档）会影响配对。
--   这些正是"事后需要解释清楚"的事情，因此值得留痕。
--
--   `registration_format_preferences` 仍然**不**审计：它纯粹是偏好，
--   改动频繁且没有直接后果，最终结果在 Phase 4 的配对提案快照里会保留下来。
-- -----------------------------------------------------------------------------
do $attach$
declare
  t text;
  audited text[] := array['partner_requests', 'registrations'];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end
$attach$;
