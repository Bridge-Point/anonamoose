FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -s /bin/false appuser
USER appuser

EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002

CMD ["node", "server.js"]
