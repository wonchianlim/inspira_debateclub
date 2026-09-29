-- =============================================================================
-- 20260929090300_formats.sql
--
-- 辩论赛制与位置（第 6.2 节，以及 docs/schema.md 的 S-6）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- debate_formats
--
-- ⚠️ 队伍人数与每场队伍数**必须**从这里读取，绝不在应用代码里硬编码
--    （第 6.2 节明确要求）。新增赛制应当只加数据、不改代码。
-- -----------------------------------------------------------------------------
create table public.debate_formats (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  team_size smallint not null check (team_size > 0),
  teams_per_match smallint not null check (teams_per_match > 1),
  active boolean not null default true,
  display_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.debate_formats is
  '赛制配置。队伍人数与每场队伍数在此维护，应用代码不得硬编码。';
comment on column public.debate_formats.teams_per_match is
  '每场比赛的队伍数。BP 为 4，其余为 2。';

create trigger debate_formats_set_updated_at
  before update on public.debate_formats
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- format_positions（docs/schema.md S-6 新增）
--
-- 为什么需要这张表：第 6.4 节说位置要在领域逻辑中按赛制校验
-- （PF/JWSD/WSDC/1v1 用 PROP/OPP，BP 用 OG/OO/CG/CO），并明确要求
-- "不要用一个僵化的数据库枚举"。如果这份对应关系写在代码里，就会再次出现
-- "把赛制相关数值散落在各处"的问题——而这正是第 6.2 节禁止的。
--
-- 放进查找表后，新增赛制只需加数据。
-- -----------------------------------------------------------------------------
create table public.format_positions (
  id uuid primary key default gen_random_uuid(),
  format_id uuid not null references public.debate_formats (id),
  code text not null,
  display_name text not null,
  team_slot smallint not null check (team_slot > 0),
  display_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (format_id, code),
  unique (format_id, team_slot)
);

comment on table public.format_positions is
  '按赛制定义的位置代号（PROP/OPP/OG/OO/CG/CO）。team_slot 表示该位置属于第几支队伍。';

create trigger format_positions_set_updated_at
  before update on public.format_positions
  for each row execute function public.set_updated_at();
