/**
 * Next.js 的启动钩子（instrumentation）。
 *
 * 依据规范第 5.3 节："Validate required server environment variables at startup."
 *
 * 为什么放在这里：这个 `register()` 在服务器进程启动时**执行一次**，
 * 因此配置缺失会在启动阶段就暴露，而不是等用户点开某个页面才报错。
 * 这正是"提前失败"（fail fast）——比运行时才发现要好得多。
 *
 * 两种刻意跳过的情况：
 *
 * 1. **边缘运行时**：这里的环境变量校验只针对 Node 服务端进程。
 * 2. **构建阶段**（`next build`）：构建不需要运行时密钥。如果构建也强制校验，
 *    CI 在没有密钥的环境里就无法构建，反而会逼着大家把密钥塞进构建环境——
 *    那样更不安全。因此构建阶段跳过，只在真正启动服务时校验。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertServerEnv } = await import("@/lib/env/server");

  try {
    assertServerEnv();
  } catch (error) {
    // ⚠️ 实测发现：Next.js 会**捕获** instrumentation 里抛出的异常，
    // 只打印 "Failed to prepare server"，然后**继续运行**（甚至会先打印
    // "✓ Ready"）。这样容器会被认为健康，部署系统也不会重启它 ——
    // 与"启动失败"的目标不符。因此这里显式退出，让失败真正可见。
    console.error("\n" + (error as Error).message + "\n");
    console.error("应用已停止：请修好环境变量后重新启动。");

    // 刻意经由 globalThis 间接调用，而不是直接写 `process.exit(1)`：
    // Turbopack 会把 instrumentation 一并打进 Edge 运行时的包，而 Edge 没有
    // process.exit，直接写会产生构建警告（实测出现过）。
    // 上面的 NEXT_RUNTIME 判断已经保证这段代码只在 Node 下执行，因此行为不变。
    const runtimeProcess = globalThis.process;
    runtimeProcess?.exit?.(1);
  }
}
