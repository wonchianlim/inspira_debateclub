import { MetaChip } from "@/components/domain/meta-chip";
import { StatusBadge } from "@/components/domain/status-badge";
import { CLUB_DEFAULT_TIMEZONE, utcToZonedLocal } from "@/lib/domain/timezone";
import type { StudentBallot } from "@/lib/student/ballots";

/**
 * 一份评分表的**可读版面**（UI/UX 规范 §8.7）。
 *
 * 规范原文：
 *   "Use readable document layout, **not a dense form after submission**.
 *    Preserve line breaks. Print view must be clean and omit navigation."
 *
 * ⚠️ 这一版改的就是"dense form"那一点。原来一份评分表把六类东西
 * （个人分、两队总分、判决理由、交锋、论点、队伍反馈）平铺在一张卡片里，
 * 全部是 `label：value` 的段落，学生分不清哪段是分数、哪段是裁判写的话。
 * 现在按**读一份文件**的顺序分节：这一场是什么 → 结果 → 分数 →
 * 裁判的反馈（做得好的地方 / 应该改进的地方）→ 判决理由 → 交锋与论点。
 *
 * ⚠️ 两个刻意的做法：
 *
 * 1. **"做得好的地方"与"应该改进的地方"分成两节**。
 *    它们来自模板里两个不同的字段（`feedback_strength` / `feedback_improve`），
 *    规范也点名要求按 "What worked / What to improve" 分组。
 *    原来它们只是两行 `label：value`，读起来像是同一段话的两句。
 * 2. **所有长文字都保留换行**（`whitespace-pre-wrap`）。
 *    裁判写的分段是有意的，压成一行会读不出重点 —— 规范明确要求 preserve line breaks。
 *
 * ⚠️ 复核请求表单由调用方通过 `reviewSlot` 传进来，而不是在这里 import。
 * 那样这个组件就是纯展示的，可以用测试夹具单独渲染；
 * 而且表单本身对"打印"没有意义，它带 `print:hidden`。
 */
export function BallotDocument({
  ballot,
  anonymousLabel,
  reviewSlot,
}: {
  ballot: StudentBallot;
  /** 同一场有多位裁判时的匿名序号（只有一位时传 null） */
  anonymousLabel: string | null;
  reviewSlot?: React.ReactNode;
}) {
  const localDateTime = (iso: string) =>
    utcToZonedLocal(new Date(iso), CLUB_DEFAULT_TIMEZONE).replace("T", " ");

  // 模板里"做得好的地方 / 应该改进的地方"这两类反馈，规范要求分开呈现。
  // 用模板字段的 key 判断，而不是猜中文标签 —— 标签是可以被管理员改的。
  const strengthFeedback = ballot.teamFeedback.filter((entry) => entry.key === "feedback_strength");
  const improveFeedback = ballot.teamFeedback.filter((entry) => entry.key === "feedback_improve");
  const otherTeamFeedback = ballot.teamFeedback.filter(
    (entry) => entry.key !== "feedback_strength" && entry.key !== "feedback_improve",
  );

  return (
    <article
      aria-label={`第 ${ballot.matchNumber} 场${anonymousLabel ? ` · ${anonymousLabel}` : ""}的评分表`}
      className="border-border rounded-lg border px-4 py-4 md:px-5 md:py-5"
    >
      {/* ---------------- 这一场是什么 ---------------- */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title font-semibold">
            第 {ballot.matchNumber} 场 · {ballot.roomName}
          </h3>
          <MetaChip>{ballot.formatCode}</MetaChip>
          {anonymousLabel ? <MetaChip>{anonymousLabel}</MetaChip> : null}
          {/* 结果放在最上面：学生打开这一页最先想知道的就是"我赢了没有" */}
          {ballot.myRank !== null ? (
            <StatusBadge>第 {ballot.myRank} 名</StatusBadge>
          ) : ballot.outcome ? (
            <StatusBadge tone={ballot.outcome === "win" ? "success" : "neutral"}>
              {ballot.outcome === "win" ? "胜" : "负"}
            </StatusBadge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {localDateTime(ballot.scheduledStart)}（{CLUB_DEFAULT_TIMEZONE}）
          {ballot.templateName ? ` · 使用模板：${ballot.templateName}` : ""}
        </p>
      </header>

      {/* ---------------- 我的分数 ---------------- */}
      {ballot.myScores.length > 0 || ballot.myTotals.length > 0 || ballot.matchScores.length > 0 ? (
        <section aria-labelledby={`scores-${ballot.ballotId}`} className="mt-5">
          <h4 id={`scores-${ballot.ballotId}`} className="text-sm font-medium">
            我的分数
          </h4>
          {/*
            用表格：分数是"标签 → 数值"的对照，表格天然是对的东西。
            `aria-labelledby` 让屏幕阅读器念出这张表是**哪一节**的表 ——
            否则只会听到"表格，N 行"，不知道是分数还是别的。
          */}
          <table aria-labelledby={`scores-${ballot.ballotId}`} className="mt-2 w-full text-sm">
            <tbody>
              {ballot.myScores.map((score) => (
                <tr key={score.key} className="border-border border-b last:border-0">
                  <th
                    scope="row"
                    className="text-muted-foreground py-1.5 pr-4 text-left font-normal"
                  >
                    {score.label}
                  </th>
                  <td className="py-1.5 text-right font-medium">{score.value}</td>
                </tr>
              ))}
              {ballot.myTotals.map((total) => (
                <tr key={total.key} className="border-border border-b last:border-0">
                  <th scope="row" className="py-1.5 pr-4 text-left">
                    {total.label}
                  </th>
                  <td className="py-1.5 text-right font-medium">
                    {total.value} / {total.max}
                  </td>
                </tr>
              ))}
              {/*
                整场的评分项（例如「裁判信心」）。`optionLabel` 来自模板，
                因此显示成「势均力敌（2）」而不是光一个 2 ——
                规范 §8.7 要求用**模板里的原话**，否则学生看不懂 2 是什么意思。
              */}
              {ballot.matchScores.map((score) => (
                <tr key={score.key} className="border-border border-b last:border-0">
                  <th
                    scope="row"
                    className="text-muted-foreground py-1.5 pr-4 text-left font-normal"
                  >
                    {score.label}
                  </th>
                  <td className="py-1.5 text-right font-medium">
                    {score.optionLabel ? `${score.optionLabel}（${score.value}）` : score.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ---------------- 两队总分 ---------------- */}
      {ballot.sideTotals.some((side) => side.total !== null) ? (
        <section aria-labelledby={`totals-${ballot.ballotId}`} className="mt-5">
          <h4 id={`totals-${ballot.ballotId}`} className="text-sm font-medium">
            两队总分
          </h4>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {ballot.sideTotals.map((side) => (
              <li key={side.teamId}>
                {side.label}
                <strong className="ml-1">{side.total ?? "—"}</strong>
                {side.teamId === ballot.myTeamId ? (
                  <span className="text-muted-foreground ml-1 text-xs">（我方）</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------------- 裁判给我们的反馈 ---------------- */}
      {ballot.teamFeedback.length > 0 ? (
        <section aria-labelledby={`feedback-${ballot.ballotId}`} className="mt-5">
          <h4 id={`feedback-${ballot.ballotId}`} className="text-sm font-medium">
            裁判给{ballot.myTeamLabel}的反馈
          </h4>

          {strengthFeedback.length > 0 ? (
            <div className="mt-2">
              <h5 className="text-success text-xs font-semibold">做得好的地方</h5>
              {strengthFeedback.map((entry) => (
                <p key={entry.key} className="mt-1 text-sm whitespace-pre-wrap">
                  {entry.value}
                </p>
              ))}
            </div>
          ) : null}

          {improveFeedback.length > 0 ? (
            <div className="mt-3">
              <h5 className="text-warning text-xs font-semibold">应该改进的地方</h5>
              {improveFeedback.map((entry) => (
                <p key={entry.key} className="mt-1 text-sm whitespace-pre-wrap">
                  {entry.value}
                </p>
              ))}
            </div>
          ) : null}

          {otherTeamFeedback.map((entry) => (
            <div key={entry.key} className="mt-3">
              <h5 className="text-muted-foreground text-xs font-semibold">{entry.label}</h5>
              <p className="mt-1 text-sm whitespace-pre-wrap">{entry.value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---------------- 判决理由 ---------------- */}
      {ballot.matchText.length > 0 ? (
        <section aria-labelledby={`reason-${ballot.ballotId}`} className="mt-5">
          <h4 id={`reason-${ballot.ballotId}`} className="text-sm font-medium">
            裁判的整体说明
          </h4>
          {ballot.matchText.map((entry) => (
            <div key={entry.key} className="mt-2">
              <h5 className="text-muted-foreground text-xs font-semibold">{entry.label}</h5>
              <p className="mt-1 max-w-prose text-sm whitespace-pre-wrap">{entry.value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---------------- 交锋与论点 ---------------- */}
      {ballot.matchLists.length > 0 || ballot.teamLists.length > 0 ? (
        <section aria-labelledby={`lists-${ballot.ballotId}`} className="mt-5">
          <h4 id={`lists-${ballot.ballotId}`} className="text-sm font-medium">
            交锋与论点
          </h4>
          {ballot.matchLists.map((list) => (
            <div key={list.key} className="mt-2">
              <h5 className="text-muted-foreground text-xs font-semibold">{list.label}</h5>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {list.entries.map((entry, index) => (
                  <li key={index} className="whitespace-pre-wrap">
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {ballot.teamLists.map((list) => (
            <div key={list.key} className="mt-2">
              <h5 className="text-muted-foreground text-xs font-semibold">
                {ballot.myTeamLabel}的{list.label}
              </h5>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {list.entries.map((entry, index) => (
                  <li key={index} className="whitespace-pre-wrap">
                    {entry}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---------------- 复核（这是**动作**，打印时不需要） ---------------- */}
      {reviewSlot ? (
        <div className="border-border mt-5 border-t pt-4 print:hidden">{reviewSlot}</div>
      ) : null}
    </article>
  );
}
