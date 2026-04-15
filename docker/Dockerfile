FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor-packages/ ./vendor-packages/
COPY scripts/verify-vendor.mjs ./scripts/verify-vendor.mjs
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor-packages/ ./vendor-packages/
COPY scripts/verify-vendor.mjs ./scripts/verify-vendor.mjs
RUN npm ci
COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV REDIS_URL="redis://dummy:6379"
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/worker ./worker
COPY --from=builder /app/src/generated ./src/generated

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
