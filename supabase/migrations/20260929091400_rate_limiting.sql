-- =============================================================================
-- 20260929091400_rate_limiting.sql
--
-- 应用层频率限制（主规格第 7 节："Rate-limit authentication-adjacent,
-- review-request, and email-trigger endpoints."）
--
-- 为什么在数据库里而不是进程内存里：
--   进程内计数器在重启后清零，且多实例部署时各自为政——攻击者只要让请求落到
--   不同实例就能绕过。放在数据库里，限制才是全局有效的。
--
-- 为什么由应用来计算哈希：
--   计数键是"谁"（通常是 IP）。直接存 IP 属于存储个人信息。
--   应用侧用带盐的 SHA-256 把 IP 变成不可逆的摘要，数据库只存摘要与计数，
--   因此这张表里没有任何可直接识别的个人信息（AGENTS.md 的隐私要求）。
--   盐放在应用的环境变量里（RATE_LIMIT_SALT），因此即使数据库被读取，
--   也无法通过彩虹表反推出 IP。
--
-- 采用固定窗口（fixed window）而不是滑动窗口：实现简单、可预测，
-- 对"防止暴力破解与邮件轰炸"这个目的已经足够；代价是窗口边界处理论上
-- 可以出现两倍瞬时流量，属于可接受的取舍。
-- =============================================================================

create table public.rate_limit_counters (
  bucket text not null,
  subject_hash text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket, subject_hash, window_start)
);

comment on table public.rate_limit_counters is
  '固定窗口频率计数器。subject_hash 是应用侧加盐哈希后的值，不含可直接识别的个人信息。';
comment on column public.rate_limit_counters.bucket is
  '用途分类，例如 auth.sign_in、auth.password_reset。不同用途各自计数。';

-- -----------------------------------------------------------------------------
-- 消耗一次配额。返回 true = 允许；false = 已超限。
--
-- 并发安全：`count = count + 1` 与 RETURNING 在一条语句内完成，因此
-- 并发调用不会互相覆盖（不会出现"两个请求都读到 0 于是都放行"）。
-- -----------------------------------------------------------------------------
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_subject_hash text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_max < 1 then
    raise exception 'rate limit: p_max 必须 >= 1' using errcode = 'invalid_parameter_value';
  end if;
  if p_window_seconds < 1 then
    raise exception 'rate limit: p_window_seconds 必须 >= 1' using errcode = 'invalid_parameter_value';
  end if;

  -- 固定窗口的起点：把当前时间向下取整到窗口边界
  --
  -- ⚠️ 这里刻意使用 clock_timestamp() 而**不是** now()。
  --    now() 返回的是**事务开始时间**，在同一个事务内多次调用不会变化。
  --    这一点是实测发现的：把"跨窗口后应重新计数"写成测试时，由于 DO 块
  --    整体是一个事务，now() 始终是同一个值，窗口永远不会推进，测试失败。
  --    用 clock_timestamp() 取真实墙钟时间，行为与"每次请求各自一个事务"
  --    的实际场景一致，且不受调用方事务边界的影响。
  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_counters (bucket, subject_hash, window_start, count)
  values (p_bucket, p_subject_hash, v_window, 1)
  on conflict (bucket, subject_hash, window_start)
  do update set
    count = public.rate_limit_counters.count + 1,
    updated_at = now()
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

comment on function public.consume_rate_limit(text, text, integer, integer) is
  '消耗一次频率配额；返回 false 表示已超限。并发安全。';

-- -----------------------------------------------------------------------------
-- 权限
--
-- 这张表**不对任何客户端角色开放**（连 SELECT 都不给）：计数属于系统内部状态。
-- 只允许服务端的 service-role 通过上面的函数访问。
-- -----------------------------------------------------------------------------
alter table public.rate_limit_counters enable row level security;

revoke all on public.rate_limit_counters from anon, authenticated;
grant all on public.rate_limit_counters to service_role;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- 清理旧窗口
--
-- 固定窗口的计数器会不断累积。保留 7 天足够排查问题，也避免表无限增长。
-- 由定时任务调用（或手工执行）。
-- -----------------------------------------------------------------------------
create or replace function public.prune_rate_limit_counters(p_keep_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_counters
  where window_start < now() - make_interval(days => p_keep_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_rate_limit_counters(integer) from public, anon, authenticated;
grant execute on function public.prune_rate_limit_counters(integer) to service_role;
