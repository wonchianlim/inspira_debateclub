import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * 启用 `forbidden()` / `unauthorized()`（next/navigation）。
     *
     * 为什么需要：主规格第 8 节要求"未授权用户收到安全的 403 或跳转"。
     * 用 `forbidden()` 会返回**真正的 HTTP 403 状态码**；若改成跳转到一个
     * 提示页面，状态码会是 200 —— 那样爬虫、监控与日志都无法区分
     * "页面不存在"与"没有权限"。
     *
     * 配套文件：app/forbidden.tsx（403 的用户界面）。
     */
    authInterrupts: true,
  },
};

export default nextConfig;
