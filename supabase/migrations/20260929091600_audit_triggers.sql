-- =============================================================================
-- 20260929091600_audit_triggers.sql
--
-- 审计日志的自动写入（主规格第 15 节 Phase 2："Audit all privileged mutations."；
-- 第 6.7 节与第 7 节）。
--
-- -----------------------------------------------------------------------------
-- 为什么用**数据库触发器**，而不是在应用代码里"顺手写一条审计"
--
-- Phase 1 已经建好了 audit_logs 表，但当时**没有任何代码往里写**。本步要解决的是
-- "怎么保证每个特权改动都留下记录"。
--
-- 我最初按计划打算在 `lib/audit/` 里写一个服务端函数，由各个 Server Action 调用。
-- 但那样有一个无法回避的缺陷：Supabase 的 JS 客户端**每个请求各自一个事务**，
-- "先改数据、再写审计"是两次 HTTP 请求、两个事务。于是必然存在这样的窗口：
--   改成功了但写审计失败  → 改动没有留痕（审计失效）
--   写审计成功了但改失败  → 记录了没有发生的改动（审计说谎）
--
-- 用触发器就没有这个问题：
--   - 它在**同一个事务**里执行，要么都成功、要么都回滚；
--   - 它**无法被忘记**——新增一条写数据的代码路径不需要记得写审计；
--   - 它也拦得住"绕过应用直接改数据库"的情况。
--
-- 这是对 `docs/phase-2-plan.md` 中 P2-2 写法的一处**有意偏离**，
-- 理由与取舍见 `docs/decisions/0013-audit-via-triggers.md`。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- system_settings 补一个行标识
--
-- 审计表要求 entity_id 非空，而每张被审计的表都需要一个稳定的行标识。
-- system_settings 原本用 key 作主键（text），无法直接当 uuid 用。
-- 这里补一个代理主键列：key 仍然是业务上的自然键，id 只用于审计与引用。
-- -----------------------------------------------------------------------------
alter table public.system_settings
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.system_settings
  add constraint system_settings_id_key unique (id);

comment on column public.system_settings.id is
  '代理标识，供审计日志的 entity_id 使用；业务上仍以 key 为自然键。';

-- -----------------------------------------------------------------------------
-- 敏感字段的遮蔽
--
-- 规范第 7 节：日志不得记录手机号、邮件内容、认证 token 或选票内容。
-- AGENTS.md 另外明确：不得在任何地方记录**个人邮箱地址**。
--
-- 做法：按**列名模式**匹配并替换为固定标记，而不是删掉这个键。
-- 保留键、替换值的好处是：审计记录仍然看得出"这个字段被改过"，
-- 只是看不到内容 —— 否则"改了邮箱"这件事会从审计里彻底消失。
--
-- 用模式匹配而不是固定清单，是为了让**将来新增的列**也被自动覆盖
-- （例如以后加了 wechat_id 之类，只要名字里带这些词就会被遮蔽）。
-- -----------------------------------------------------------------------------
create or replace function public.audit_is_sensitive_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_key ilike '%email%'
    or p_key ilike '%phone%'
    or p_key ilike '%mobile%'
    or p_key ilike '%password%'
    or p_key ilike '%token%'
    or p_key ilike '%secret%'
    or p_key ilike '%api_key%'
    or p_key ilike '%apikey%';
$$;

comment on function public.audit_is_sensitive_key(text) is
  '列名是否属于"绝不写入审计日志"的敏感字段（规范第 7 节、AGENTS.md）。';

-- 递归遮蔽：jsonb 里可能嵌套对象/数组（例如 system_settings.value）。
-- 只处理顶层键是不够的 —— 敏感值可能藏在嵌套结构里。
create or replace function public.audit_redact(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_payload is null then
    return null;
  end if;

  case jsonb_typeof(p_payload)
    when 'object' then
      select coalesce(
        jsonb_object_agg(
          kv.key,
          case
            when public.audit_is_sensitive_key(kv.key) then '"[已隐去]"'::jsonb
            else public.audit_redact(kv.value)
          end
        ),
        '{}'::jsonb
      )
      into v_result
      from jsonb_each(p_payload) as kv;

      return v_result;

    when 'array' then
      select coalesce(jsonb_agg(public.audit_redact(elem.value)), '[]'::jsonb)
      into v_result
      from jsonb_array_elements(p_payload) as elem;

      return v_result;

    else
      return p_payload;
  end case;
end;
$$;

comment on function public.audit_redact(jsonb) is
  '递归遮蔽 jsonb 中的敏感字段；被遮蔽的值替换为「[已隐去]」，键本身保留。';

-- -----------------------------------------------------------------------------
-- 审计触发器函数
--
-- 用 AFTER 而不是 BEFORE：这样看到的是 `set_updated_at` 等 BEFORE 触发器
-- 处理之后**最终**落库的值，审计记录与真实数据一致。
-- -----------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_entity_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_action text;
  v_request_id uuid;
  v_request_text text;
begin
  -- 操作者来自 JWT。用 service-role 或直接连库执行时会是 NULL，
  -- 这类"系统操作"记为空操作者，而不是伪造成某个人。
  v_actor := public.current_profile_id();

  -- 可选的请求串联 id：应用可通过 set_config('app.request_id', ...) 提供。
  v_request_text := nullif(current_setting('app.request_id', true), '');
  if v_request_text is not null then
    begin
      v_request_id := v_request_text::uuid;
    exception when others then
      v_request_id := null;
    end;
  end if;

  if tg_op = 'INSERT' then
    v_entity_id := new.id;
    v_new := public.audit_redact(to_jsonb(new));
    v_action := 'insert';

  elsif tg_op = 'UPDATE' then
    v_entity_id := new.id;
    v_action := 'update';

    -- 用**原始值**判断是否真的有变化，并且刻意排除 `updated_at`。
    --
    -- 两个理由：
    --   1. 不能用遮蔽后的值比较：如果这次只改了邮箱这类敏感字段，遮蔽之后
    --      两边都变成「[已隐去]」、看起来完全相同，就会被误判成"没变化"
    --      而**整条漏记** —— 那等于"改邮箱不留痕"。
    --   2. 必须排除 `updated_at`：`set_updated_at` 触发器每次都会把它刷新成 now()，
    --      若把它算进比较，则"保存了但什么都没改"也永远会被判定为有变化，
    --      于是审计表被无意义的记录塞满。
    if (to_jsonb(old) - 'updated_at') is not distinct from (to_jsonb(new) - 'updated_at') then
      return null;
    end if;

    v_old := public.audit_redact(to_jsonb(old));
    v_new := public.audit_redact(to_jsonb(new));

  else
    v_entity_id := old.id;
    v_old := public.audit_redact(to_jsonb(old));
    v_action := 'delete';
  end if;

  insert into public.audit_logs
    (actor_profile_id, entity_type, entity_id, action, old_value, new_value, request_id)
  values
    (v_actor, tg_table_name, v_entity_id, v_action, v_old, v_new, v_request_id);

  return null;
end;
$$;

comment on function public.audit_row_change() is
  '通用审计触发器：把行级增删改写入 audit_logs，与业务写入处于同一事务。';

-- -----------------------------------------------------------------------------
-- 挂到需要审计的表上
--
-- 范围：Phase 2 涉及的全部特权写入面（用户与角色、裁判与资格、赛制、
-- 活动与活动赛制、通知、系统设置），以及学生赛制档案（评分由管理员维护）。
--
-- 刻意**不**挂 audit_logs 自己（会无限递归）。
-- 刻意**不**挂 registrations / registration_format_preferences：
-- 那是学生自助操作，不属于"特权改动"，属于 Phase 3 的范围。
-- -----------------------------------------------------------------------------
do $attach$
declare
  t text;
  audited text[] := array[
    'profiles', 'user_roles',
    'student_profiles', 'judge_profiles',
    'student_format_profiles', 'judge_format_qualifications',
    'debate_formats', 'format_positions',
    'events', 'event_formats',
    'notices', 'system_settings'
  ];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end
$attach$;

-- -----------------------------------------------------------------------------
-- 收紧 audit_logs 的权限
--
-- Phase 1 的迁移注释写着"客户端角色没有 INSERT 权限，只通过 SECURITY DEFINER 函数写入"，
-- 但实测发现 `authenticated` **确实**持有 INSERT（Supabase 默认授权留下的）。
-- 当时靠"没有 INSERT 策略"挡住了，属于默认拒绝，本身是安全的；
-- 但注释与事实不符，而且少了一层保护。
--
-- 现在写入完全由 SECURITY DEFINER 触发器负责，客户端**不再需要** INSERT，
-- 因此显式撤销，让权限与注释一致（两层保护：无权限 + 无策略）。
-- -----------------------------------------------------------------------------
revoke insert on public.audit_logs from authenticated;
