export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">INSPIRA 辩论俱乐部管理系统</h1>

      <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
        这是项目的初始骨架页面（Phase 1 第 P1-1 步）。目前系统只有基础设施，
        还没有报名、配对、比赛或评分表功能——那些属于后续阶段。
      </p>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <dt className="font-medium">当前阶段</dt>
          <dd className="mt-1 text-neutral-600 dark:text-neutral-400">Phase 1 — 基础设施与认证</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <dt className="font-medium">字体</dt>
          <dd className="mt-1 text-neutral-600 dark:text-neutral-400">
            系统字体（未使用任何境外字体服务）
          </dd>
        </div>
      </dl>
    </main>
  );
}
