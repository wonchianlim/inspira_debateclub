-- =============================================================================
-- 20261001090000_check_in_window.sql
--
-- 让「签到在活动开始前 30 分钟开放」这句话**成为真的**。
--
-- -----------------------------------------------------------------------------
-- 实测发现的问题
--
-- `registrations` 上的 `registrations_update_own` 策略允许学生更新自己那一行
-- （这是必要的：学生要能自助签到）。但**没有任何地方**检查签到时间：
--
--   * `studentCheckInAction` 只检查"报名了、没签到过、报名没取消"；
--   * 数据库里只有 `enforce_check_in_method`，它管的是"谁能写 admin 这个值"。
--
-- 于是一名学生可以在活动开始**一周前**点签到，而且会成功 ——
-- 而界面上写着「签到在活动开始前 30 分钟开放」。
-- 那句话当时只是一句话，不是一条规则。
--
-- 2026-10-01 产品负责人决定：这句话必须在**服务端与数据库**都成立。
-- 服务端那一半在 `lib/admin/check-in-actions.ts`（给用户一句能看懂的中文），
-- 数据库这一半就是本迁移 —— 因为服务端检查可以被绕过（直接调 PostgREST），
-- 而"这个人是不是真的到场了"是记录真实性问题，和 RLS 属于同一层。
--
-- -----------------------------------------------------------------------------
-- 为什么用 `events.check_in_opens_at` 而不是写死"开始前 30 分钟"
--
-- 「30 分钟」只是**创建活动时的默认值**（规范第 9.4 节），而管理员可以在
-- 「系统管理 → 设置」里改掉它。活动表里的 `check_in_opens_at` 才是这次活动
-- 真正的签到开放时刻（新建活动时按当时的设置算好写进去，之后还可以单独调整）。
-- 两者在管理员改过设置之后就不相等了 —— 因此规则必须读**那一列**。
--
-- -----------------------------------------------------------------------------
-- 为什么豁免 `check_in_method = 'admin'`
--
-- 规范第 2.8 节原文："Students use a simple **Check In** action;
-- **staff can check them in manually**."
-- 人工代签这条通道存在的意义正是"学生到了现场但手机没电"，
-- 也就是一个**管理员按自己判断覆盖默认规则**的入口。
-- 因此本触发器只约束学生自助签到（`self`）这一条路径。
-- ⚠️ 这是一处刻意的取舍：管理员仍可在窗口外代签。若产品负责人希望连管理员
--    也一并挡住，删掉下面那个 `check_in_method` 判断即可。
-- =============================================================================

create or replace function public.enforce_check_in_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opens_at timestamptz;
  event_timezone text;
begin
  -- 只在"变成已签到"的那一刻检查。之后修改这一行的其它列（例如管理员改备注）
  -- 不该再被拦住 —— 那时人早就签过到了。
  if new.checked_in_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.checked_in_at is not null then
    return new;
  end if;

  -- 人工代签是规范明文要求保留的通道，只约束学生自助签到
  if new.check_in_method is distinct from 'self' then
    return new;
  end if;

  select e.check_in_opens_at, e.timezone
    into opens_at, event_timezone
    from public.events e
   where e.id = new.event_id;

  -- 活动不存在时交给外键去报错，不在这里编一个自己的错误
  if opens_at is null then
    return new;
  end if;

  if now() < opens_at then
    -- 错误信息里给出**这次活动**的签到开放时刻（按活动时区），
    -- 而不是笼统地说"还没开放" —— 后者会让人不知道该等多久。
    raise exception '签到还没有开放。本次活动签到于 %（%）开放。',
      to_char(opens_at at time zone event_timezone, 'YYYY-MM-DD HH24:MI'),
      event_timezone
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_check_in_window() is
  '学生自助签到时要求已达到该活动的 check_in_opens_at；管理员代签（check_in_method = admin）豁免。';

drop trigger if exists registrations_enforce_check_in_window on public.registrations;
create trigger registrations_enforce_check_in_window
  before insert or update on public.registrations
  for each row execute function public.enforce_check_in_window();
