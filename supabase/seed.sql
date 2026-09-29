-- =============================================================================
-- INSPIRA 种子数据
--
-- 由 `supabase db reset` 在全部迁移执行完毕后自动运行
-- （见 supabase/config.toml 的 [db.seed] 配置）。
--
-- 这里只放**稳定不变**的基础数据：五种辩论赛制与它们的位置代号。
-- 业务数据（活动、报名、配对等）绝不放在这里。
--
-- ⚠️ 只允许虚构数据。绝不放入真实学生信息（AGENTS.md 硬性规则）。
--
-- 关于赛制名称：主规格第 6.2 节的表格给的是英文名称，此处**逐字照搬**，
-- 因为主规格是 V1 的唯一事实来源。界面若需要中文名，应在展示层处理，
-- 而不是改动这份基础数据。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 五种赛制（第 6.2 节）
--
-- ⚠️ 队伍人数（team_size）与每场队伍数（teams_per_match）必须从这里读取，
--    绝不在应用代码里硬编码（第 6.2 节明确要求）。
-- -----------------------------------------------------------------------------
insert into public.debate_formats (code, name, team_size, teams_per_match, active, display_order)
values
  ('PF',        'Public Forum Debate',          2, 2, true, 1),
  ('JWSD',      'Junior World Schools Debate',  3, 2, true, 2),
  ('WSDC',      'World Schools Debate',         3, 2, true, 3),
  ('BP',        'British Parliamentary Debate', 2, 4, true, 4),
  ('ONE_V_ONE', 'One-on-One Debate',            1, 2, true, 5)
on conflict (code) do update set
  name            = excluded.name,
  team_size       = excluded.team_size,
  teams_per_match = excluded.teams_per_match,
  active          = excluded.active,
  display_order   = excluded.display_order;

-- -----------------------------------------------------------------------------
-- 位置代号（第 6.4 节 + docs/schema.md S-6）
--
-- PF / JWSD / WSDC / ONE_V_ONE：PROP（正）与 OPP（反），各对应一支队伍。
-- BP：四支队伍，OG / OO / CG / CO。
--
-- 放进数据而不是代码，是为了新增赛制时只需加数据，不必改代码并重新测试。
-- -----------------------------------------------------------------------------
insert into public.format_positions (format_id, code, display_name, team_slot, display_order)
select f.id, p.code, p.display_name, p.team_slot, p.display_order
from public.debate_formats f
cross join (values
  ('PROP', '正方',   1, 1),
  ('OPP',  '反方',   2, 2)
) as p(code, display_name, team_slot, display_order)
where f.code in ('PF', 'JWSD', 'WSDC', 'ONE_V_ONE')
on conflict (format_id, code) do update set
  display_name  = excluded.display_name,
  team_slot     = excluded.team_slot,
  display_order = excluded.display_order;

insert into public.format_positions (format_id, code, display_name, team_slot, display_order)
select f.id, p.code, p.display_name, p.team_slot, p.display_order
from public.debate_formats f
cross join (values
  ('OG', '正方上院', 1, 1),
  ('OO', '反方上院', 2, 2),
  ('CG', '正方下院', 3, 3),
  ('CO', '反方下院', 4, 4)
) as p(code, display_name, team_slot, display_order)
where f.code = 'BP'
on conflict (format_id, code) do update set
  display_name  = excluded.display_name,
  team_slot     = excluded.team_slot,
  display_order = excluded.display_order;
