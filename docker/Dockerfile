FROM node:20 AS builder

WORKDIR /app

# Install API deps
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# Install UI deps
COPY ui/package*.json ./ui/
RUN --mount=type=cache,target=/root/.npm \
    cd ui && npm ci --legacy-peer-deps

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./
COPY ui/ ./ui/

# Build API (tsc) + UI (next build → static export)
RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/ui/out ./ui/out/

RUN mkdir -p /app/data && \
    groupadd -g 1001 -f appuser && \
    useradd -u 1001 -g appuser -s /bin/false appuser && \
    chown -R appuser:appuser /app/data
USER appuser

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
