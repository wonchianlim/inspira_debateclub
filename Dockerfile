# =============================================================================
# INSPIRA 生产镜像
#
# 依据 docs/architecture.md 第 17 节：
#   - 多阶段构建，运行层只保留 standalone 产物；
#   - 以**非 root 用户**运行；
#   - 可复现：依赖用 `npm ci` 按 lockfile 安装。
#
# 为什么用 node:24-alpine：与开发机运行时一致（Node 24），且 alpine 体积最小。
# 注意本机到 Docker Hub 不通，构建前需要先把基础镜像从可用镜像源拉下来并重打标签
# （见 docs/deployment-regions.md 与 P1-10 的说明）。
# =============================================================================

# -----------------------------------------------------------------------------
# 阶段 1：安装依赖
#
# 单独一层的好处：只要 package.json / package-lock.json 没变，
# 后续构建可以直接复用这层缓存，不必重装依赖。
# -----------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

# 不下载遥测数据（构建更快，也避免向外部服务发请求）
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
# 使用 BuildKit 缓存挂载：重复构建时 npm 不必重新下载包
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# -----------------------------------------------------------------------------
# 阶段 2：构建
# -----------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建阶段**不**需要运行时密钥：instrumentation 会跳过构建期的环境变量校验，
# 这正是为了让 CI 在没有密钥的环境里也能构建（见 instrumentation.ts 的说明）。
RUN --mount=type=cache,target=/root/.npm \
    npm run build

# -----------------------------------------------------------------------------
# 阶段 3：运行
#
# 只带 standalone 产物、静态资源与 public 目录 —— 没有源码、没有 devDependencies、
# 没有任何 .env 文件。
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# 创建非 root 用户。以最小权限运行是关键的安全实践：
# 万一应用被攻破，攻击者拿到的不是一个 root shell。
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# 健康检查用 /api/health：它会真的查一次数据库，因此"健康"意味着应用与数据库都通
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
