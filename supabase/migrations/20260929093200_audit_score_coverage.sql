-- =============================================================================
-- 20260929093200_audit_score_coverage.sql
--
-- 补上 `ballot_scores` 与 `ballot_feedback` 的审计（Phase 9 的审计覆盖复查）。
--
-- -----------------------------------------------------------------------------
-- ⚠️ 这是复查发现的**真缺口**，不是补形式
--
-- Phase 7 给 `ballots` 挂了审计，但**逐项分数存在 `ballot_scores` 里**。
-- 结果是一个具体的问题：
--
--   > 有人把某位发言者的"内容"从 28 改成 24，`ballots` 那一行**没有任何变化** ——
--   > 审计日志里**什么都不会出现**。
--
-- 而"谁改了分数"正是 Phase 1 建立审计的**首要理由**。
-- 换句话说：审计覆盖了"评分表被重开""评分表被发布"，
-- 却恰好漏掉了**分数本身**。
--
-- 评语同理：改一条已发布的评语会改变学生看到的内容。
--
-- -----------------------------------------------------------------------------
-- ⚠️ 代价必须写明：审计会**很吵**
--
-- 现在的保存路径是"**先删光再写入**"（P7-4 的决定，为的是让"删掉的分数"
-- 真的从库里消失）。因此一次保存会产生：
--
--   删 18 行 + 插 18 行 = **36 条审计记录**（六位发言者 × 三个维度）
--
-- 而裁判在一场辩论里会反复保存草稿。所以审计日志里会有大量
-- "分数从 28 变成 28"这类无实质变化的记录。
--
-- 三个选择摆在这里：
--   (a) 不给分数挂审计 —— 就是现在的状态，**改分数不留痕**，不可接受；
--   (b) 挂审计，接受嘈杂 —— 选了这个；
--   (c) 改成"逐条 diff"的保存路径 —— 那要改 P7-4 的实现与测试，
--       而且会带回"删掉的分数残留在库里"那个原始问题。
--
-- 选 (b) 的理由：**留痕比整洁重要**。嘈杂的日志可以过滤，
-- 没记下来的改动**事后无法恢复**。
--
-- ⚠️ 如果将来日志量成为问题，正确做法是给审计加一个"只记有实质变化的行"
--    的判据（`audit_row_change` 里已经在用同样的思路处理 `updated_at`），
--    而不是把分数从审计里拿掉。
-- =============================================================================

do $attach$
declare
  v_table text;
begin
  foreach v_table in array array['ballot_scores', 'ballot_feedback']
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'audit_' || v_table and tgrelid = ('public.' || v_table)::regclass
    ) then
      execute format(
        'create trigger audit_%1$s after insert or update or delete on public.%1$s
           for each row execute function public.audit_row_change()',
        v_table
      );
    end if;
  end loop;
end
$attach$;

comment on trigger audit_ballot_scores on public.ballot_scores is
  '逐项分数的增删改。Phase 9 复查发现：分数只存在这张表里，因此 ballots 的审计覆盖不到分数本身。';
