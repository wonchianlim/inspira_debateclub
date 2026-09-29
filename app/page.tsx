import { StatePanel } from "@/components/domain/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">INSPIRA 辩论俱乐部管理系统</h1>
            <Badge variant="secondary">Phase 1</Badge>
          </div>
          <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
            这是项目的基础设施阶段页面。目前只有应用外壳、布局与页面状态样式；
            报名、配对、比赛与评分表功能属于后续阶段，尚未实现。
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="当前状态摘要">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">当前阶段</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Phase 1 — 基础设施与认证</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">字体与外部资源</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                使用系统字体，页面不加载任何境外字体或 CDN 资源
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">数据与权限</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">数据库与多角色权限将在后续步骤接入</p>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="states-heading">
          <div className="flex flex-col gap-1">
            <h2 id="states-heading" className="text-lg font-semibold tracking-tight">
              页面状态样式
            </h2>
            <p className="text-muted-foreground max-w-prose text-sm">
              规范第 13 节要求每个主要页面都设计好这五种状态。每种状态都同时用
              <strong>图标与文字</strong>表达，不依赖颜色——色觉障碍用户也能分辨。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatePanel variant="loading" description="正在从服务器读取数据…" />
            <StatePanel variant="empty" description="还没有任何记录。创建之后会显示在这里。" />
            <StatePanel
              variant="error"
              description="读取数据时出现问题。可以重试，若持续失败请联系管理员。"
              action={
                <Button variant="outline" size="sm">
                  重试
                </Button>
              }
            />
            <StatePanel
              variant="unauthorized"
              description="你的角色没有查看此内容的权限。如果你认为这是错误的，请联系管理员。"
            />
            <StatePanel variant="success" description="设置已保存。" />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
