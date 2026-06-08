# syntax=docker/dockerfile:1.7
# Build context is the repo ROOT (see docker-compose.yml), so all paths below are
# relative to the workspace root, not backend/.

# -------- Stage 1: builder --------
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

# Install workspace deps first (better layer caching). Copy only manifests.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile

# Build the backend.
COPY backend ./backend
RUN pnpm --filter enterprise-ai-agent-backend build

# Produce a pruned, self-contained deployment of just the backend (dist + prod deps).
RUN pnpm --filter enterprise-ai-agent-backend deploy --prod /prod/backend


# -------- Stage 2: runtime --------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /prod/backend/node_modules ./node_modules
COPY --from=builder /prod/backend/dist ./dist
COPY --from=builder /prod/backend/package.json ./package.json

# Drop privileges. The 'node' user is preinstalled in the official image.
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
