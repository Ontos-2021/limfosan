# syntax=docker/dockerfile:1
# Imagen de producción: un backend que sirve API + web compilada.
# Build: docker build -t limfosan-app:dev --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) app/

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/juego-truco/package.json packages/juego-truco/package.json
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
ARG COMMIT_SHA=unknown
ENV COMMIT_SHA=${COMMIT_SHA} APP_VERSION=0.1.0
RUN npm run build

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --create-home --uid 1001 appuser
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/juego-truco/package.json packages/juego-truco/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/juego-truco/dist ./packages/juego-truco/dist
COPY --from=builder /app/packages/web/dist ./packages/web/dist
ARG COMMIT_SHA=unknown
ENV COMMIT_SHA=${COMMIT_SHA} APP_VERSION=0.1.0
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "packages/server/dist/index.js"]
