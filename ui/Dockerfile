FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -s /bin/false appuser
USER appuser

EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
