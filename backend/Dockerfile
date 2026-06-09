# syntax=docker/dockerfile:1.7

# -------- Stage 1: builder --------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching).
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile

# Copy sources and build.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build

# Prune dev deps for a lean runtime layer.
RUN pnpm prune --prod


# -------- Stage 2: runtime --------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Copy built artifacts and production deps only.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Drop privileges. The 'node' user is preinstalled in the official image.
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
