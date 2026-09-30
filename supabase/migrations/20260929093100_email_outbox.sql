-- =============================================================================
-- 20260929093100_email_outbox.sql
--
-- 邮件发件队列（主规格第 15 节 Phase 9：
-- "Complete **email job processing and templates**"）。
--
-- -----------------------------------------------------------------------------
-- ⚠️ 为什么先做队列、不先接服务商
--
-- 邮件服务商**尚未选定**（Phase 1 起的待确认项 O-6）。但"发邮件"这件事
-- 有两个可以完全分开的部分：
--
--   (a) **决定要发什么、发给谁、什么时候发** —— 这是领域逻辑；
--   (b) **真的把信投出去** —— 这需要一个服务商与凭据。
--
-- (a) 现在就能做完并测试，(b) 等选型。把两者混在一起写，
-- 等选型时就得改一遍业务代码；分开之后，接服务商只是加一个"消费队列"的作业。
--
-- 因此这张表是 **(a) 的落点**：写进队列 = 业务侧认为"这封信该发"。
-- 在接上服务商之前，队列**只积累、不投递** —— 这一点在界面上会写明，
-- 而不是让人以为信已经发出去了。
-- =============================================================================

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),

  /*
   * 收件人。
   *
   * ⚠️ 同时存 profile_id 与 email 是**刻意的**：
   *   - `to_profile_id` 用于"这个人还有没有待发信件"这类业务判断；
   *   - `to_email` 是**投递时**的地址快照。
   *
   * 只存 profile_id 的话，收件人改邮箱会让**已排队的历史信件**改寄新地址 ——
   * 那是错的：当时的通知本就该发给当时的地址。
   *
   * `on delete set null`：档案不是物理删除的（Phase 1 的保护），
   * 但真出现 null 时队列行要留着，否则投递日志会凭空少一截。
   */
  to_profile_id uuid references public.profiles (id) on delete set null,
  to_email text not null,

  /*
   * 模板键 + 数据。
   *
   * ⚠️ 存**模板键与数据**，不存渲染好的正文 ——
   * 这样改一次模板，队列里所有未发出的信都会用新文案，
   * 而不是一部分旧文案一部分新文案（那种不一致几乎无法排查）。
   *
   * ⚠️ `payload` 里**不得放入不该进日志的内容**（密码、令牌）。
   *    它是给模板填空用的业务数据（学生姓名、活动名、比赛时间）。
   */
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,

  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,

  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_outbox_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),

  -- 重试次数不能是负的
  constraint email_outbox_attempts_non_negative check (attempts >= 0),

  constraint email_outbox_email_not_blank check (btrim(to_email) <> ''),
  constraint email_outbox_template_not_blank check (btrim(template_key) <> ''),

  -- 发出了就必须有发出时间；没发出就不该有
  constraint email_outbox_sent_consistency
    check ((status = 'sent') = (sent_at is not null)),

  /*
   * 失败的必须带上原因。
   *
   * 没有这一条，队列里会出现一批"失败了但不知道为啥"的行 ——
   * 那比没有重试更糟：运维看得见问题却无从下手。
   */
  constraint email_outbox_failed_has_reason
    check (status <> 'failed' or (last_error is not null and btrim(last_error) <> ''))
);

comment on table public.email_outbox is
  '邮件发件队列。业务侧只负责"这封信该发"；投递需要一个邮件服务商（尚未选定）。在接上之前队列只积累、不投递。';

create index email_outbox_pending_idx on public.email_outbox (status, scheduled_at)
  where status in ('pending', 'failed');
create index email_outbox_profile_idx on public.email_outbox (to_profile_id);

create trigger email_outbox_set_updated_at
  before update on public.email_outbox
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
--
-- ⚠️ **没有给 authenticated 任何写权限**，包括管理员。
--
-- 入队由服务角色在 server-only 模块里做（那里才有"该发什么"的判断），
-- 而"投递"将来也是由一个后台作业用服务角色做。
-- 给管理员 INSERT 权限没有用处，只会多一条可以绕开业务规则写队列的路径。
--
-- 管理员**可以读**：出问题时需要看得见队列里积了什么。
-- 非管理员**完全看不到** —— 队列里全是别人的邮箱地址。
-- -----------------------------------------------------------------------------
alter table public.email_outbox enable row level security;

create policy email_outbox_manage_read on public.email_outbox
  for select to authenticated
  using (public.is_manager());

-- -----------------------------------------------------------------------------
-- ⚠️ 刻意**不进审计**
--
-- 队列里的每一次状态变化（pending → sending → sent）都是**机器行为**，
-- 不是人对竞赛数据的更改。一次活动几百封信就是几百行审计，
-- 会把"谁改了分数"这类真正要查的记录淹没。
--
-- 而且 `to_email` 是个人信息 —— 虽然 Phase 1 的审计脱敏清单里
-- `%email%` 已经被遮蔽，但**不写进审计**比"写进去再遮蔽"更稳妥：
-- 遮蔽函数的规则将来可能被改动，而没写进去的东西不会因为规则变化而泄露。
--
-- 投递失败的原因记在 `last_error` 里，那是运维要看的，不是审计要看的。
-- =============================================================================
