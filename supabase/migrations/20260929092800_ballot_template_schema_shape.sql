-- =============================================================================
-- 20260929092800_ballot_template_schema_shape.sql
--
-- 给 `ballot_templates.schema` 加**形状**约束。
--
-- -----------------------------------------------------------------------------
-- 为什么需要（这是集成测试发现的，不是我原来就想到的）
--
-- 我原以为数据库会拒绝一个数组形态的 schema。**它不会。**
-- 集成测试里那条"数据库拒绝非法 schema"最初显示通过，
-- 但它通过的原因是 `created_by` 为空 —— 与 schema 完全无关（一个假通过）。
-- 修掉那个原因之后，插入**成功了**：数组被原样存进了 jsonb 列。
--
-- 后果很具体：一份 `[1,2,3]` 的模板一旦进了库，
-- 读出来的代码会当它是对象去取 `.fields`，拿到 `undefined`，
-- 于是裁判界面渲染出**一个没有任何输入框的评分表** ——
-- 而且因为它 active，那个赛制的裁判**谁也打不了分**。
--
-- 应用层的 `validateBallotTemplate` 会拦住它，但那条路径只在**写入时**经过。
-- 直接调 PostgREST、脚本、或将来某个忘了校验的代码路径都不经过它。
-- 因此这一层约束是必要的纵深防御。
-- =============================================================================

alter table public.ballot_templates
  add constraint ballot_templates_schema_is_object
  check (jsonb_typeof(schema) = 'object');

-- 必须真的带一份字段清单 —— 空对象同样会让界面渲染出空白评分表
alter table public.ballot_templates
  add constraint ballot_templates_schema_has_fields
  check (jsonb_typeof(schema -> 'fields') = 'array');

comment on constraint ballot_templates_schema_is_object on public.ballot_templates is
  'schema 必须是 JSON 对象。集成测试发现数据库原本接受数组，那会让裁判界面渲染出空表。';
