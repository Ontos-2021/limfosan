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
npm run build      # compila en orden: juego-truco, shared, web, server
npm test           # compila deps y corre vitest de cada paquete (necesita Postgres, ver abajo)
npm run typecheck  # tsc --noEmit por paquete
npm run lint       # eslint
npm run format     # prettier
```

## Desarrollo local con Postgres (E2/E4)

```sh
cp .env.example .env   # opcional; los defaults apuntan al compose local
docker compose -f docker-compose.dev.yml up -d   # postgres:16 en 127.0.0.1:5433
npm run dev -w @limfosan/server   # backend con recarga (puerto 3000, migra solo)
npm run dev -w @limfosan/web      # frontend Vite (puerto 5173, proxea /api y /socket.io)
```

- Las migraciones (`packages/server/drizzle/`) corren solas al arrancar.
- Tests de servidor: usan `TEST_DATABASE_URL` (default `truco_test` en el
  compose) y la crean si falta. Requieren el compose levantado.
- Tests web E2E: levantan backend + frontend solos (BD `truco_e2e`).
- Primer admin: registrarse con `ADMIN_EMAIL` + `ADMIN_BOOTSTRAP_CODE`
  (un solo uso), luego enrollar TOTP vía API (ver `docs/runbook-beta.md`).

## Partida local vs CPU y online

La web implementa el **reglamento v1 completo** (`docs/reglamento-truco-v1.md`):
baraja de 40 cartas, envido con cadena completa (incluida falta envido al resto
del puntero), truco/retruco/vale cuatro con la regla de recante, pardas, mazo y
cierre a 30 puntos. Jugás contra una **CPU local determinista** que solo ve sus
cartas y lo público, igual que vos. Cada partida usa `?seed=N` (reproducible).

- Motor puro: `packages/juego-truco` (`engine.ts` + `bot.ts`), sin I/O; 40 pruebas
  unitarias + simulación de 1500 partidas aleatorias (fuzzing).
- **Online (E2+E4):** invitados sin registro, cuentas con email, mesas privadas
  por enlace (`/?mesa=ABC123`), motor autoritativo en servidor, persistencia
  Postgres, reconexión con gracia, timers, revancha y admin con MFA.
  Operación: ver `docs/runbook-beta.md`.
- El nombre `Mesa` y la identidad visual son provisionales.

**Baraja dual:** el jugador elige entre "Clásica" (los PNG heredados, 36 cartas,
con los cuatro dieces dibujados como SVG propio como reserva) y "Propia" (SVG
paramétrico original, 40 cartas). El toggle está en el encabezado y la
preferencia se guarda en el navegador. Los PNG **no tienen licencia verificada**:
su uso está autorizado solo para evaluación local (ver
`packages/web/public/cards/README.md`).

Pruebas de interfaz (desde `app/`):

```sh
npx playwright install --with-deps chromium webkit
npm run test -w @limfosan/web
```

Las capturas se generan en `packages/web/test-results/` (no versionadas).

## Puertos

- Backend: `PORT` (default 3000). Healthcheck: `GET /api/health`.
- Web dev: 5173 (solo desarrollo; en producción la sirve el backend).

## Docker

```sh
docker build -t limfosan-app:dev --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) .
docker run --rm -p 3000:3000 limfosan-app:dev
```
