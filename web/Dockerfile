# Litmus web app. Multi-stage build producing a small standalone Next.js server.
# Runs anywhere a container runs: AWS App Runner, ECS/Fargate, Lightsail, Render.

# 1. Install dependencies
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build the app (emits .next/standalone thanks to output: "standalone")
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Runtime: only the standalone server, static assets, public dir, and the
#    committed seed audits (so example permalinks work on a fresh, empty disk).
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/seed-audits ./seed-audits

# A writable audit dir so audits run on the server can persist for the life of
# the instance. Seeded reports are served straight from ./seed-audits regardless.
RUN mkdir -p /app/.audits && chown -R nextjs:nodejs /app/.audits

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
