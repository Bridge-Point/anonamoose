FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist/

RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -s /bin/false appuser
USER appuser

EXPOSE 3000 3001

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
