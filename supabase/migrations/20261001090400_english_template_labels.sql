-- 20261001090400_english_template_labels.sql
--
-- 把官方评分表模板里的**中文标签换成英文**。
--
-- 为什么必须是一个迁移，而不是只改代码：
--   模板的字段标签、选项标签与校验提示都写在 `ballot_templates.schema`（jsonb）里，
--   由 super_admin 点「载入官方模板」时 seed 进数据库。
--   而那个动作是**幂等**的：已经有活跃模板的赛制会被**跳过**。
--   所以只改 `lib/domain/official-templates.ts` 的话，
--   生产上已经 seed 过的模板**仍然是中文** —— 裁判与学生看到的都还是中文。
--
-- 产品负责人 2026-10-01 决定界面只保留英文（"there are none chinese speakers"），
-- 因此这一步跟上。
--
-- ⚠️ 为什么用"逐对替换"而不是把整份新 JSON 写死在迁移里：
--   `lib/domain/official-templates.ts` 是模板的**唯一来源**（那个文件自己也是这么写的）。
--   在迁移里再抄一份完整 JSON，两份迟早漂移，
--   而"测试通过、实际生效的是另一份"正是本项目反复在防的问题。
--   ⚠️ 因此**以后改模板文案时，这个迁移不会自动跟上** ——
--   新改的文案要么再写一个迁移，要么约定"重载模板"由管理员手动执行。
--
-- ⚠️ 替换顺序按**字符串长度从长到短**：否则 '内容' 会先把 '内容（回复）'
--   咬掉一半，剩下 'Content（回复）' 这种半中半英的东西。
--
-- ⚠️ 每行只 UPDATE 一次（先算出新值再写），而不是每一对替换都 UPDATE 一次：
--   否则一张模板会被更新几十次 —— 审计日志里会塞满几十条无意义的记录。

do $$
declare
  template_row record;
  replacement record;
  new_schema jsonb;
  changed_count int := 0;
begin
  for template_row in select id, schema from public.ballot_templates loop
    new_schema := template_row.schema;

    for replacement in
      select *
        from (values
        ('你选的胜方队伍总分低于对方。Public Forum 不允许 Low Point Win（低分获胜），', 'The team you marked as the winner has a lower total than the other team. Public Forum does not allow a low point win. '),
        ('两队的队伍总分相同，不能提交。因为允许半分，请调整发言者分数，让胜方的队伍总分更高。', 'Both teams have the same total. Half points are allowed, so adjust the speaker scores to make the winning team''s total higher before submitting.'),
        ('你选的胜方队伍总分低于对方。本赛制不允许 Low Point Win（低分获胜），', 'The team you marked as the winner has a lower total than the other team. This format does not allow a low point win. '),
        ('两队队伍总分的差距必须在 0.5 到 12 分之间。差得太少说明几乎平局，', 'The gap between the two team totals must be between 0.5 and 12. A gap this small means the round was almost a draw. '),
        ('两队的队伍总分相同，不能提交。请调整分数，让胜方的队伍总分更高。', 'Both teams have the same total. Adjust the scores so the winning team''s total is higher before submitting.'),
        ('即兴辩论（Extemporaneous Debate）官方模板', 'Extemporaneous Debate official template'),
        ('差得太多通常说明打分有问题 —— 请检查发言者分数后再提交。', 'A gap this large usually means a scoring mistake - check the speaker scores before submitting.'),
        ('British Parliamentary（BP）官方模板', 'British Parliamentary (BP) official template'),
        ('WSDC 的平均水平。70 不是惩罚，它就是平均', 'the WSDC average. 70 is not a penalty; it is the average'),
        ('正开 vs 反开（哪一方建立了更强的初始阵地）', 'Gov Opening vs Opp Opening (which side built the stronger opening case)'),
        ('BP 的平均水平。75 不是低分，它就是平均', 'the BP average. 75 is not a low score; it is the average'),
        ('基本可用，但在分析、策略或表达上有明显弱点', 'Usable, with clear weaknesses in analysis, strategy or delivery'),
        ('正开 vs 正关（政府席位哪一队贡献更大）', 'Gov Opening vs Gov Closing (which government bench contributed more)'),
        ('反开 vs 反关（反对席位哪一队贡献更大）', 'Opp Opening vs Opp Closing (which opposition bench contributed more)'),
        ('Public Forum（PF）官方模板', 'Public Forum (PF) official template'),
        ('本队两人合计（仅供参考，不决定名次）', 'This team''s two speakers combined (reference only; does not decide the ranking)'),
        ('正关 vs 反关（哪一方的延伸更强）', 'Gov Closing vs Opp Closing (whose extension was stronger)'),
        ('明显强于一般水平，是一篇很好的演讲', 'Clearly above average; a very good speech'),
        ('各方面都有重大弱点，有效贡献有限', 'Major weaknesses throughout; limited effective contribution'),
        ('真正优秀的演讲，几乎没有明显弱点', 'A genuinely excellent speech with almost no clear weakness'),
        ('精英竞赛级别的出色表现，非常罕见', 'Elite competition standard; very rare'),
        ('高于平均，分析、策略与表达都不错', 'Above average; analysis, strategy and delivery all sound'),
        ('请调整分数或改选胜方后再提交。', 'Adjust the scores, or change the winner, before submitting.'),
        ('几乎没有提出有意义的辩论内容', 'Almost no meaningful argument'),
        ('扎实的演讲，明显好于常规水平', 'Solid speech, clearly above the usual level'),
        ('问题明显，但仍有一定辩论内容', 'Clearly problematic, but with some debating content'),
        ('精英级别，几乎没有明显弱点', 'Elite, with almost no clear weakness'),
        ('这位发言者可以改进的一点', 'One thing this speaker can improve'),
        ('近乎完美的演讲，极其罕见', 'A near-perfect speech; extremely rare'),
        ('为什么是新的（延伸用）', 'Why it is new (for extensions)'),
        ('极其罕见的近乎完美演讲', 'An extremely rare, near-perfect speech'),
        ('给这位发言者的一句话', 'One line for this speaker'),
        ('相当于上台问好就坐下', 'Equivalent to saying hello and sitting down'),
        ('基本可用，但明显偏弱', 'Usable but clearly weak'),
        ('WSDC 官方模板', 'WSDC official template'),
        ('JWSD 官方模板', 'JWSD official template'),
        ('WSDC 评分参照', 'WSDC score reference'),
        ('明显强的竞赛级演讲', 'A clearly strong, competition-level speech'),
        ('有意义的贡献有限', 'Limited meaningful contribution'),
        ('几乎没有有效辩论', 'Almost no effective debating'),
        ('BP 评分参照', 'BP score reference'),
        ('交叉质询与配合', 'Cross-examination and teamwork'),
        ('本队的主要贡献', 'This team''s main contribution'),
        ('策略与全局意识', 'Strategy and global awareness'),
        ('应该改进的地方', 'What to improve'),
        ('做得好的地方', 'What went well'),
        ('强于常规水平', 'Stronger than usual'),
        ('内容（回复）', 'Content (reply)'),
        ('策略（回复）', 'Strategy (reply)'),
        ('表达（回复）', 'Delivery (reply)'),
        ('为什么重要', 'Why it matters'),
        ('分析与应变', 'Analysis and adaptation'),
        ('结构与策略', 'Structure and strategy'),
        ('论证与证据', 'Argumentation and evidence'),
        ('反驳与比较', 'Refutation and comparison'),
        ('发言者得分', 'Speaker scores'),
        ('出色的演讲', 'Excellent speech'),
        ('主要交锋', 'Key clashes'),
        ('主要论点', 'Main arguments'),
        ('个人得分', 'Individual score'),
        ('个人总分', 'Individual total'),
        ('队伍总分', 'Team total'),
        ('回复总分', 'Reply total'),
        ('最终排名', 'Final ranking'),
        ('排名理由', 'Reason for ranking'),
        ('裁判评估', 'Judge assessment'),
        ('裁判信心', 'Judge confidence'),
        ('裁判笔记', 'Judge notes'),
        ('判决理由', 'Reason for decision'),
        ('清晰判决', 'Clear decision'),
        ('非常接近', 'Very close'),
        ('势均力敌', 'Close call'),
        ('有竞争性', 'Competitive'),
        ('问题明显', 'Clearly problematic'),
        ('正方主张', 'Proposition case'),
        ('正方立场', 'Proposition stance'),
        ('反方主张', 'Opposition case'),
        ('反方立场', 'Opposition stance'),
        ('论证', 'Argumentation'),
        ('交锋', 'Clash'),
        ('内容', 'Content'),
        ('策略', 'Strategy'),
        ('表达', 'Delivery'),
        ('清晰', 'Clear'),
        ('总分', 'Total')
        ) as t(zh, en)
       order by length(t.zh) desc
    loop
      new_schema := replace(new_schema::text, replacement.zh, replacement.en)::jsonb;
    end loop;

    if new_schema is distinct from template_row.schema then
      -- `updated_at` 由触发器维护；审计触发器会记一条，而不是几十条
      update public.ballot_templates set schema = new_schema where id = template_row.id;
      changed_count := changed_count + 1;
    end if;
  end loop;

  raise notice 'english_template_labels: 更新了 % 份模板', changed_count;
end $$;
