# syntax=docker/dockerfile:1.7
<<<<<<< HEAD
# Build context is the repo ROOT (see docker-compose.yml), so all paths below are
# relative to the workspace root, not backend/.
=======
>>>>>>> 651a0558592feb65a9df8327110da0226de684ef

# -------- Stage 1: builder --------
FROM node:20-alpine AS builder

WORKDIR /app

<<<<<<< HEAD
# Install workspace deps first (better layer caching). Copy only manifests.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

# Build the backend.
COPY backend ./backend
RUN npm run build -w enterprise-ai-agent-backend
=======
# Install dependencies first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources and build.
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Prune dev deps for a lean runtime layer.
RUN npm prune --omit=dev
>>>>>>> 651a0558592feb65a9df8327110da0226de684ef


# -------- Stage 2: runtime --------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

<<<<<<< HEAD
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace=enterprise-ai-agent-backend --include-workspace-root=false

COPY --from=builder /app/backend/dist ./backend/dist
=======
# Copy built artifacts and production deps only.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
>>>>>>> 651a0558592feb65a9df8327110da0226de684ef

# Drop privileges. The 'node' user is preinstalled in the official image.
USER node

EXPOSE 3000

<<<<<<< HEAD
CMD ["node", "backend/dist/main.js"]
=======
CMD ["node", "dist/main.js"]
>>>>>>> 651a0558592feb65a9df8327110da0226de684ef
