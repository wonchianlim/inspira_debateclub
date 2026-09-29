-- =============================================================================
-- 20260929090500_events.sql
--
-- 事件与其启用的赛制（第 6.3 节）。
-- =============================================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  timezone text not null default 'Asia/Shanghai',
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  check_in_opens_at timestamptz not null,
  warning_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.event_status not null default 'draft',
  meeting_url text,
  notice text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 第 6.3 节的时间先后关系
  constraint events_registration_window_valid
    check (registration_opens_at < registration_closes_at),
  constraint events_registration_closes_before_start
    check (registration_closes_at <= starts_at),
  constraint events_check_in_opens_before_start
    check (check_in_opens_at <= starts_at),
  constraint events_warning_before_start
    check (warning_at <= starts_at),
  constraint events_start_before_end
    check (starts_at < ends_at)
);

comment on table public.events is
  '每周活动。所有时间以 UTC 存储（TIMESTAMPTZ），展示时按 timezone 渲染。';
comment on column public.events.event_date is
  '业务日期（用于列表分组与"每周一次"统计）。必须与 starts_at 在该事件时区下的日期一致，见校验触发器。';
comment on column public.events.warning_at is
  '预警时刻（通常为开始前 10 分钟）。到此刻仍未到齐的房间在看板上标为警告。';

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- event_date 与 starts_at 的一致性校验
--
-- 为什么用触发器而不是 CHECK：`timestamptz AT TIME ZONE text` 依赖时区数据库，
-- 属于 STABLE 而非 IMMUTABLE，PostgreSQL 不允许出现在 CHECK 约束里。
--
-- 为什么需要这条校验（docs/schema.md S-9）：event_date 与 starts_at 可以互相矛盾
-- （例如 event_date 填周日，starts_at 是周一），而按周统计与列表分组依赖前者。
-- 两者不一致会产生难以察觉的错误统计。
-- -----------------------------------------------------------------------------
create or replace function public.validate_event_date_matches_start()
returns trigger
language plpgsql
as $$
begin
  if (new.starts_at at time zone new.timezone)::date <> new.event_date then
    raise exception
      'event_date（%）必须等于 starts_at（%）在时区 % 下的日期（%）。',
      new.event_date, new.starts_at, new.timezone, (new.starts_at at time zone new.timezone)::date
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.validate_event_date_matches_start() is
  '保证 events.event_date 与 starts_at 在事件时区下的日期一致（S-9）。';

create trigger events_validate_date
  before insert or update on public.events
  for each row execute function public.validate_event_date_matches_start();

-- -----------------------------------------------------------------------------
-- event_formats
-- -----------------------------------------------------------------------------
create table public.event_formats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  format_id uuid not null references public.debate_formats (id),
  enabled boolean not null default true,
  motion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, format_id)
);

comment on table public.event_formats is
  '某次活动启用了哪些赛制，以及该赛制的辩题（motion）。';

create trigger event_formats_set_updated_at
  before update on public.event_formats
  for each row execute function public.set_updated_at();
