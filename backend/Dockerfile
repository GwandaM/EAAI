# syntax=docker/dockerfile:1.7
# Build context is the repo ROOT (see docker-compose.yml), so all paths below are
# relative to the workspace root, not backend/.

# -------- Stage 1: builder --------
FROM node:20-alpine AS builder

WORKDIR /app

# Install workspace deps first (better layer caching). Copy only manifests.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

# Build the backend.
COPY backend ./backend
RUN npm run build -w enterprise-ai-agent-backend


# -------- Stage 2: runtime --------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace=enterprise-ai-agent-backend --include-workspace-root=false

COPY --from=builder /app/backend/dist ./backend/dist

# Drop privileges. The 'node' user is preinstalled in the official image.
USER node

EXPOSE 3000

CMD ["node", "backend/dist/main.js"]
