/**
 * `server-only` 的测试替身。
 *
 * 真实的 `server-only` 包在非服务端上下文里会**直接抛错**：
 *   "This module cannot be imported from a Client Component module."
 *
 * 这是它在 Next.js 里的设计目的——让"客户端误用服务端模块"变成构建错误。
 * 但单元测试运行在普通 Node 环境里，没有 `react-server` 条件，
 * 因此需要在 vitest 配置中把它替换成本文件（空模块）。
 *
 * 这样我们既保留了生产构建期的边界保护，又能直接测试真实的服务端模块。
 */
export {};
