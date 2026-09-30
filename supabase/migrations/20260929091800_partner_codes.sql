-- =============================================================================
-- 20260929091800_partner_codes.sql
--
-- 学生"搭档码"与按码查找（主规格第 9.2 节第 4 条：Student may request a partner）。
--
-- -----------------------------------------------------------------------------
-- 为什么是"搭档码"而不是"浏览参与者名单"
--
-- 最初的实现是提供一个函数，让已报名的学生看到本活动参与者的**姓名 + 学校**列表，
-- 再从列表里挑人。产品负责人指出更好的做法：给每个学生一个编号，
-- 配对时直接输入对方的编号即可找到人。
--
-- 这个建议确实更好，因为它把**"能看到别人"从默认变成需要对方主动分享**：
--   - 浏览名单：同场任何人默认就能看到全部参与者的姓名与学校；
--   - 搭档码：只有对方把码告诉了你，你才能找到他。码没有泄露，就没人能找到你。
--
-- ⚠️ **但有一个前提，缺了就前功尽弃：搭档码必须是随机生成的，不能是连号。**
--    如果做成 S0001、S0002……，任何人从 S0001 开始顺序试，
--    就能把全部学生的姓名与学校枚举出来 —— 隐私收益完全消失。
--    因此下面生成的是 10 位随机码（32 个易读字符，约 1.1×10^15 种），
--    并且**排除了容易看错的字符**（0/O、1/I/L），因为学生要口头或手抄分享这个码。
--
-- 选择"码"这条路之后，原来那个"列出参与者"的函数就**删掉**了 ——
-- 留着它就等于把刚关上的那扇门重新打开。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 搭档码生成器
-- -----------------------------------------------------------------------------
create or replace function public.generate_partner_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 排除 0/O、1/I/L：这些字符在口头转述或手抄时极易混淆
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text := '';
  i int;
begin
  for i in 1..10 loop
    v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return v_code;
end;
$$;

comment on function public.generate_partner_code() is
  '生成 10 位随机搭档码。刻意排除易混淆字符。必须是随机的，不能是连号。';

-- -----------------------------------------------------------------------------
-- 加到学生档案上
-- -----------------------------------------------------------------------------
alter table public.student_profiles add column partner_code text;

-- 回填已有学生（本机目前没有真实数据；生产上线前也应当没有）
update public.student_profiles
   set partner_code = public.generate_partner_code()
 where partner_code is null;

alter table public.student_profiles alter column partner_code set not null;
alter table public.student_profiles alter column partner_code set default public.generate_partner_code();

alter table public.student_profiles
  add constraint student_profiles_partner_code_key unique (partner_code);

comment on column public.student_profiles.partner_code is
  '随机搭档码，供学生在配对时互相分享。全库唯一；不含姓名等个人信息。';

-- 大小写不敏感查找用：统一存大写，并在查询时 upper()
create index student_profiles_partner_code_upper_idx
  on public.student_profiles (upper(partner_code));

-- -----------------------------------------------------------------------------
-- 按码查找
--
-- 返回字段刻意只有三项：姓名、学校、以及"对方是否也报了这场活动"。
-- **不含评分**（避免学生之间互相比较），**不含邮箱**（个人信息不在学生之间公开）。
-- 这两点是产品负责人 2026-09-29 确认的。
--
-- ⚠️ SECURITY DEFINER 会绕过 RLS，所以函数内部必须自己把关：
--    调用者必须是**这场活动的有效参与者**（或管理员）。
--    没有这道关口，任何登录用户都能拿码来试 —— 那就成了枚举接口。
-- -----------------------------------------------------------------------------
create or replace function public.find_student_by_partner_code(p_code text, p_event uuid)
returns table (student_id uuid, display_name text, school text, registered_for_event boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sp.id,
    p.display_name,
    sp.school,
    -- 对方是否也报了这场活动。告诉调用方"对方还没报名"比笼统报错更有用，
    -- 而且这不构成新的信息泄露：调用方本来就持有对方的码。
    exists (
      select 1
      from public.registrations r
      where r.student_id = sp.id
        and r.event_id = p_event
        and r.status in ('registered', 'checked_in')
    )
  from public.student_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where upper(btrim(sp.partner_code)) = upper(btrim(p_code))
    and (
      public.is_manager()
      or exists (
        select 1
        from public.registrations mine
        where mine.event_id = p_event
          and mine.student_id = public.my_student_id()
          and mine.status in ('registered', 'checked_in')
      )
    )
  limit 1;
$$;

comment on function public.find_student_by_partner_code(text, uuid) is
  '按搭档码查找学生，只返回姓名、学校与"是否报名了该活动"。只有该活动的有效参与者或管理员可调用。';

-- -----------------------------------------------------------------------------
-- 权限
--
-- 同时撤销 PUBLIC：PostgreSQL 默认会把新建函数的 EXECUTE 授予 PUBLIC ——
-- 这是一个很容易被忽略的默认行为，若不撤销，anon 实际上就能调用。
-- -----------------------------------------------------------------------------
revoke all on function public.generate_partner_code() from public, anon;
revoke all on function public.find_student_by_partner_code(text, uuid) from public, anon;
grant execute on function public.find_student_by_partner_code(text, uuid) to authenticated;
grant execute on function public.find_student_by_partner_code(text, uuid) to service_role;
