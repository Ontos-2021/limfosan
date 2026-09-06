# Plataforma de juegos de cartas — `app/`

Monorepo de la nueva plataforma (Truco primero). Ver
[plan maestro](../docs/plan-plataforma-juegos-de-cartas.md),
[plan de desarrollo](../docs/plan-desarrollo-beta.md) y
[reglamento v1](../docs/reglamento-truco-v1.md).

## Workspaces (`packages/`)

| Paquete                 | Contenido                                                                |
| ----------------------- | ------------------------------------------------------------------------ |
| `@limfosan/shared`      | Contratos Zod compartidos HTTP/sockets                                   |
| `@limfosan/juego-truco` | Motor puro del Truco (sin I/O; E3)                                       |
| `@limfosan/server`      | Backend Express + Socket.IO (puerto 3000)                                |
| `@limfosan/web`         | Cliente React + Vite + PWA (dev en 5173, servido por el backend en prod) |

## Scripts (desde `app/`)

```sh
npm install        # instala workspaces
npm run build      # compila en orden: shared, juego-truco, web, server
npm test           # compila deps y corre vitest de cada paquete
npm run typecheck  # tsc --noEmit por paquete
npm run lint       # eslint
npm run format     # prettier
```

Desarrollo:

```sh
npm run dev -w @limfosan/server   # backend con recarga (puerto 3000)
npm run dev -w @limfosan/web      # frontend Vite (puerto 5173, proxea /api)
```

## Puertos

- Backend: `PORT` (default 3000). Healthcheck: `GET /api/health`.
- Web dev: 5173 (solo desarrollo; en producción la sirve el backend).

## Docker

```sh
docker build -t limfosan-app:dev --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) .
docker run --rm -p 3000:3000 limfosan-app:dev
```
