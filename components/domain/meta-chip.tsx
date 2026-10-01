import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * 中性元数据标签（赛制代码、队伍名、角色名、房间名、版本号……）。
 *
 * ⚠️ 它和 `StatusBadge` 的分工是**刻意的**：
 *
 *   - `StatusBadge` 表达**状态** —— 会变、有语义、颜色有意义（草稿/已发布/已完成）。
 *     规范 §5.2 说语义色"不能用作装饰"，所以状态才有颜色。
 *   - `MetaChip` 表达**属性** —— 不变、无褒贬（`BP` 就是 BP）。
 *     给赛制代码染成绿色不会让人多知道任何事，只会稀释真正状态色的含义。
 *
 * 这正是把"52 处各自决定颜色的 `<Badge>`"拆成两类的原因：
 * 当时 25 处元数据标签借用了 `<Badge variant="outline" className="font-normal">`，
 * 而 18 处真状态也在用同一个组件 —— 两种完全不同的东西共用一套视觉词汇。
 *
 * 外观与迁移前的 `<Badge variant="outline" className="font-normal">` **完全一致**
 * （描边、药丸形、常规字重），因此这是一次纯粹的语义整理，不改界面观感。
 */
export function MetaChip({ className, ...props }: React.ComponentProps<"span">) {
  return <Badge variant="outline" className={cn("font-normal", className)} {...props} />;
}
