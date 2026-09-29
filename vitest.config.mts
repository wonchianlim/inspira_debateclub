import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `server-only` 在非服务端上下文会抛错（这是它在生产构建里的保护作用）。
      // 单元测试跑在普通 Node 环境，因此替换为空模块，详见该文件内的说明。
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    // RLS 授权测试需要真实数据库，见 docs/testing.md 第 3 节。
    // 它们使用独立脚本运行，不混在单元测试里。
  },
});
