import { CircleCheck, Inbox, LoaderCircle, ShieldX, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 五种页面状态：加载中 / 空 / 错误 / 无权限 / 成功。
 *
 * 依据规范第 13 节："Loading, empty, error, unauthorized, and success states
 * are designed for every major page."
 *
 * 关键约定（同样来自第 13 节）：
 * - **绝不只靠颜色**表达状态。每个状态都同时有图标与文字，
 *   这样色觉障碍用户与非视觉用户都能分辨；
 * - 加载中与成功使用 `role="status"`（礼貌播报）；
 *   错误与无权限使用 `role="alert"`（立即播报）。
 */
export type StateVariant = "loading" | "empty" | "error" | "unauthorized" | "success";

type StateConfig = {
  icon: typeof Inbox;
  role: "status" | "alert";
  /** 是否让图标持续旋转（仅加载中） */
  spin?: boolean;
  defaultTitle: string;
  /** 供自动化测试断言的稳定标识 */
  tone: string;
};

const STATE_CONFIG: Record<StateVariant, StateConfig> = {
  loading: {
    icon: LoaderCircle,
    role: "status",
    spin: true,
    defaultTitle: "正在加载…",
    tone: "text-muted-foreground",
  },
  empty: {
    icon: Inbox,
    role: "status",
    defaultTitle: "暂无内容",
    tone: "text-muted-foreground",
  },
  error: {
    icon: TriangleAlert,
    role: "alert",
    defaultTitle: "出错了",
    tone: "text-danger",
  },
  unauthorized: {
    icon: ShieldX,
    role: "alert",
    defaultTitle: "你没有访问权限",
    tone: "text-danger",
  },
  success: {
    icon: CircleCheck,
    role: "status",
    defaultTitle: "操作成功",
    tone: "text-foreground",
  },
};

export function StatePanel({
  variant,
  title,
  description,
  action,
  className,
}: {
  variant: StateVariant;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const config = STATE_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div
      role={config.role}
      aria-live={config.role === "alert" ? "assertive" : "polite"}
      data-state={variant}
      className={cn(
        "border-border flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-6", config.tone, config.spin && "animate-spin")}
      />

      <p className="text-sm font-medium">{title ?? config.defaultTitle}</p>

      {description ? (
        <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
