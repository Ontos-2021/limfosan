# Plan de desarrollo — Truco online hasta beta cerrada (H1–H5)

> **Estado:** aprobado para ejecutar · **Fecha:** 2026-09-06
> **Deriva de:** [Plan maestro](plan-plataforma-juegos-de-cartas.md) (visión, modelo comercial, arquitectura, despliegue, presupuesto, hitos H1–H10).
> **Objetivo de esta fase:** llevar el **Truco argentino 1v1 online completo** a una **beta cerrada con los primeros usuarios**, desplegada en Coolify, con operación mínima medible.
> **Definición de "primer buen producto":** dos personas en cualquier celular juegan una partida completa con reglas correctas; si algo se corta, la partida sobrevive; si algo está mal, hay cómo reportarlo y cómo arreglarlo sin desplegar a mano.

---

## 1. Decisiones técnicas fijadas

| Área | Decisión |
|---|---|
| Código | **Monorepo** `app/` junto a `TallerAyDS/` y `docs/`, npm workspaces |
| Workspaces | `server` (Express+TS), `web` (React+Vite+TS), `shared` (contratos Zod), `juego-truco` (motor puro, sin I/O) |
| Runtime | Node 24 LTS, TypeScript strict, Docker multi-stage (`node:24-bookworm-slim`) |
| Datos | PostgreSQL + Drizzle + migraciones versionadas; estado de partida en JSONB **versionado** + log append-only de eventos |
| Tiempo real | Socket.IO 4, sesión por cookie del handshake |
| Motor | Reglamento **v1** ([reglamento-truco-v1.md](reglamento-truco-v1.md)): 40 cartas, 30 puntos, sin flor, falta envido **"al resto del puntero"**, truco 2/3/4 con regla de recante por aceptante, mano cambia al fin de mano, envido rechazado paga quien rechazó |
| Acceso | Cuentas email+contraseña (Argon2id, verificación, recuperación) **+ invitado jugable** + códigos de invitación |
| Pruebas | Vitest (motor/integración) + Playwright (e2e móvil Chrome/Webkit) + simulador de fuzzing del motor |
| Email | Resend (plan gratuito, alertas de consumo) |
| Backups | `pg_dump` cifrado diario a Cloudflare R2 + drill de restauración |
| Monitoreo | pino logs JSON + uptime-kuma (existente en Coolify) + errores visibles en admin panel |

## 2. Invitados sin registro — evaluación de negocio

**Recomendación: jugar al instante sin registro es la puerta de entrada correcta**, siempre que el registro se pida después de crear valor, no antes.

- El funnel de un juego social es *invitar → jugar → engancharse → crear cuenta*. Exigir registro antes de jugar mata el primer paso, que es la diferenciación elegida ("abrir un enlace y entrar a la mesa").
- **Qué pierde un invitado (transparente, no punitivo):** historial y estadísticas persistentes entre dispositivos, perfil, y más adelante rankings/torneos/Plus. La partida en curso y la revancha funcionan igual.
- **Momento de conversión:** al terminar una partida — *"Guardá tu historial — creá tu cuenta"* (email + contraseña, ~30 segundos). Nunca interrumpe el juego.
- **Controles:** identidad de invitado = cookie firmada emitida por el servidor (nunca username del cliente), rate limits por IP, bloqueo por sesión; los códigos de invitación siguen acotando la beta.
- **Métrica guardián:** conversión invitado→cuenta y D7 de invitados vs. cuentas registradas. Si los invitados no regresan y casi nadie convierte, se reevalúa (p. ej. pedir cuenta para la cola pública).

## 3. Alcance de la beta cerrada

**Entra:** mesas privadas por enlace, cola simple "Jugar ahora" (con práctica vs bot si no hay rival), partida completa con reglamento v1, privacidad por asiento, idempotencia, persistencia/recuperación, reconexión con gracia, timers de servidor, revancha, mensajes predefinidos (sin chat libre), bloqueo y reporte, perfil + historial + stats, tutorial interactivo, bot identificado, PWA instalable (offline solo shell/contenido, nunca jugadas), admin mínimo (reportes, bans, kill-switch, métricas, aviso de mantenimiento) con MFA, backups + drill, emails transaccionales, límite de carga probado (50 mesas).

**Fuera (explícito):** parejas 2v2, chat libre, torneos, espectadores, ELO/rankings, pagos/Plus/publicidad, multi-instancia, i18n (solo español), variantes de reglas configurables, migración de datos de `TallerAyDS`.

## 4. Entregas

Cada entrega termina con **demo + criterios de aceptación**. Flujo por entrega: rama → PR revisado → CI verde → despliegue en staging → verificación → merge. La beta cerrada (E9) **es** producción inicial: backups y cuidado de datos desde E4/E5.

| # | Entrega | Contenido principal | Criterio de aceptación |
|---|---|---|---|
| **E0** | Reglamento v1 + pendientes dueño | [`reglamento-truco-v1.md`](reglamento-truco-v1.md) (falta envido al resto del puntero, pardas, mazo, fin inmediato, casos normativos); subdominio temporal para staging | Casos normativos listados; revisión por jugador experimentado; subdominio apuntando al server |
| **E1** | Base desplegable (H1) | Scaffold monorepo, CI (lint+test+build), Dockerfile, Coolify staging (app+postgres), healthcheck con identidad de app, migraciones | Deploy reproducible desde git; healthcheck valida app+versión; staging accesible por HTTPS |
| **E2** | Identidad y acceso | Registro/verificación/recuperación, **invitado jugable**, códigos de invitación, sesiones seguras, rate limits, CSRF, admin con MFA | No se puede actuar sin sesión válida; flujo reset funciona; guest sobrevive refresh; admin requiere MFA |
| **E3** | Motor Truco (H2) | Paquete `juego-truco` puro: estado, acciones, envites con cadena completa, truco/retruco/vale-cuatro, puntuación, pardas, mazo, fin de partida | ≥90% de ramas de reglas cubiertas; **10.000 manos simuladas sin estados inválidos**; casos del reglamento v1 pasan; validación con 2–3 jugadores experimentados |
| **E4** | Partida en línea (H3) | Migraciones, pipeline de comandos idempotente y transaccional, salas Socket.IO con sesión, vistas por asiento, reconexión, timers, gracia, resultados | E2E: 2 navegadores completan partida; refresh/corte de red/restart del backend a mitad **no corrompe** ni pierde la mesa; doble comando no duplica; el rival nunca recibe mis cartas (inspección de tráfico) |
| **E5** | Mesa móvil (H4 parte 1) | UI React mobile-first: mesa vertical, mano abajo, barra de cantos, estado/puntaje de un vistazo, PWA instalable, CSP y headers | Playwright móvil (Chrome+WebKit) flujo completo; pruebas manuales iPhone Safari + Android Chrome; LCP ≤ 2,5 s, INP ≤ 200 ms, CLS < 0,1 |
| **E6** | Producto completo (H4 parte 2) | Tutorial guiado, bot de práctica (heurística local, identificado), revancha, mensajes predefinidos, bloqueo/reporte, perfil/historial/stats, ayuda del reglamento | Tutorial completable; bot termina 100 partidas sin crash; revancha repetible; reporte visible en admin |
| **E7** | Beta operable (H5) | Cola "jugar ahora", observabilidad (logs, uptime-kuma, errores), métricas (partidas completadas, inv→partida, D1/D7), prueba de carga de 50 mesas, runbook, backups R2 + **drill de restauración ejecutado**, emails | Drill documentado; kill-switch funciona; 50 mesas sintéticas sostenidas con métricas; runbook probado |
| **E8** | Hardening y salida | Checklist de lanzamiento del plan maestro completo, npm audit sin críticas, prueba de abandono con política de penas, doc de soporte | Tabla de criterios del plan maestro revisada ítem por ítem |
| **E9** | Beta cerrada | 20–40 invitados con códigos, canal de feedback, encuesta post-partida breve, monitoreo semanal, triage de feedback | Invitados completan partidas humanas; uptime medido; feedback priorizado; **decisión go/no-go para beta pública** |

## 5. Diseño técnico (resumen para implementar)

**Pipeline de jugada:** sesión verificada → autorización por asiento → validación Zod → `juego-truco.applyAccion()` puro (sin mutar si es inválida) → transacción con optimistic version check → ack → emitir vista por asiento. `command_id` único por acción (reintento = mismo resultado).

**Esquema de BD (principal):** `users` (rol `guest`/`account`, email, hash Argon2id), `sessions`, `invites`, `tables` (esperando/jugando/finalizada, asientos), `games` (state JSONB versionado, `regla_version`), `game_events` (log append-only, `command_id` único), `results`, `reports`, `blocks`, `feature_flags`, `jobs` (email/reintentos/métricas), `audit_admin`.

**Contrato de sockets:** `mesa:join` → `mesa:estado` (vista propia); `mesa:accion {commandId, action, value}` → ack / `mesa:error` / `mesa:estado` broadcast; `mesa:fin`, `mesa:revancha`. HTTP REST para auth, crear/unirse a mesa, perfil, reporte y admin.

**Timers (servidor, configurables):** ~60 s por carta, ~30 s para responder canto. Gracia de desconexión ~45 s, con tope de reconexiones por partida.

**Seguridad:** cookie httpOnly+Secure+SameSite=Lax; CSRF en mutaciones HTTP; rate limits (login, registro, acciones); Zod en todos los límites; helmet/CSP; secrets solo por env de Coolify; MFA TOTP en admin; logs sin PII sensible ni manos.

## 6. Riesgos principales de esta fase

| Riesgo | Mitigación |
|---|---|
| FSM del truco con cadenas anidadas (mayor foco de bugs) | Motor puro aislado + fuzzing 10k manos + casos normativos + revisión humana |
| Quirks de iOS Safari/WS y PWA | Playwright WebKit + prueba en iPhone real desde E5 |
| Reinicios de Coolify interrumpen partidas | Persistencia E4 + gracia + recuperación probada con restart inducido |
| Arte de barajas sin licencia a tiempo | Baraja SVG propia minimalista desde E5; arte final antes de beta pública |
| Email en spam | Dominio propio + SPF/DKIM/DMARC desde E2 |
| Capacidad del host desconocida | Prueba de 50 mesas en E7 mide antes de invitar gente |

## 7. Depende del dueño

1. Subdominio temporal ya sirve para staging; **marca definitiva** antes de invitar público.
2. Revisión del reglamento v1 con 2–3 jugadores experimentados.
3. Revisión legal puntual antes de beta pública (la beta cerrada con conocidos + T&C básicos puede avanzar).
4. Altas gratuitas de proveedor de email y R2 (~10 minutos cada una).

## 8. Criterios de salida de esta fase

- Todos los criterios de aceptación de E0–E9 cumplidos y demostrados en staging.
- 20–40 invitados jugando partidas humanas completas; métricas semanales medidas.
- Drill de backup-restauración ejecutado y documentado; rollback ensayado.
- Decisión registrada: **go / no-go para beta pública** (con motivos y pendientes).
