# Runbook — Beta cerrada de Truco online (E2+E4)

> Objetivo: operar la beta con 20–40 invitados. Una sola instancia + Postgres.
> Sin alta disponibilidad: ante caída, reiniciar y las partidas se recuperan
> desde la base al reconectar.

## 1. Variables de entorno (Coolify)

| Variable | Obligatoria | Ejemplo / nota |
|---|---|---|
| `NODE_ENV` | sí | `production` |
| `PORT` | no | `3000` (default) |
| `APP_URL` | sí | `https://truco.ejemplo.com` (enlaces de email + origen WS) |
| `DATABASE_URL` | sí | `postgres://user:pass@host:5432/truco` (Coolify: postgres privado, sin exponer) |
| `SESSION_SECRET` | sí | ≥32 caracteres aleatorios (`openssl rand -hex 32`) |
| `SESSION_TTL_DAYS` | no | `30` |
| `REQUIRE_INVITE` | no | `true` (beta cerrada: registro solo con código) |
| `ADMIN_EMAIL` | sí (bootstrap) | email del admin inicial |
| `ADMIN_BOOTSTRAP_CODE` | sí (bootstrap) | código de un solo uso, ej. `BETA-ADMIN-1X` (rotar/quitar tras usar) |
| `EMAIL_FROM` | no | `Mesa <hola@tudominio>` |
| `RESEND_API_KEY` | no | si falta, los emails solo se registran en logs (¡verificación imposible!) |
| `TURN_PLAY_SECONDS` | no | `60` |
| `TURN_RESPOND_SECONDS` | no | `30` |
| `GRACE_SECONDS` | no | `45` |
| `MAX_RECONNECTS` | no | `5` |
| `ALLOW_INSECURE_COOKIES` | no | `0` en producción (solo `1` en local sin HTTPS) |

Las migraciones corren solas al arrancar (`migrate()`). Healthcheck: `GET /api/health`
(identidad), readiness: `GET /api/ready` (base responde).

## 2. Bootstrap del administrador (una vez)

1. Desplegar con `ADMIN_EMAIL` y `ADMIN_BOOTSTRAP_CODE` definidos.
2. Registrarse en la web con ese email + el código bootstrap.
3. Enrollar MFA (la API devuelve el secreto UNA vez):
   - `POST /api/admin/mfa/enroll` (con sesión + CSRF) → `secret`, `otpauthUrl`.
   - Cargarlo en la app autenticadora y verificar:
   - `POST /api/admin/mfa/verify` `{totp: "123456"}`.
4. Desde entonces, el panel exige `POST /api/admin/login` `{email, password, totp}`
   en cada sesión nueva.
5. Quitar `ADMIN_BOOTSTRAP_CODE` del entorno (ya no sirve: existe un admin).

Sin `RESEND_API_KEY` no salen emails: la verificación y el recupero quedan
pendientes en la cola (`jobs`) y en logs. Para beta con conocidos alcanza con
invitados + registro sin verificar, pero definirlo antes de abrir.

## 3. Invitaciones y modo beta

- Crear códigos: `POST /api/admin/invites` `{label, maxUses, expiresInDays}`.
- Listar: `GET /api/admin/invites`. Revocar: `POST /api/admin/invites/:id/revocar`.
- Los invitados entran sin código por enlace de mesa; las CUENTAS requieren
  código si `REQUIRE_INVITE=true`.
- Registro sin email verificado puede jugar igual (la verificación es para
  recupero de clave y confianza futura).

## 4. Kill-switch y flags

Flags en `GET /api/admin/flags`, cambio con `POST /api/admin/flags/:key`:

| Flag | Efecto al apagar |
|---|---|
| `new_tables` | Se rechaza crear/unirse (las partidas en curso siguen) |
| `registrations` | (reservado; el registro se cierra revocando invites) |

Procedimiento ante incidente: apagar `new_tables` → diagnosticar → reencender.
Todo cambio queda en `GET /api/admin/auditoria`.

## 5. Backups y restauración (Postgres de Coolify)

- Programar backup diario en Coolify (retención ≥ 7 días) + descarga semanal
  fuera del servidor (R2 cuando esté dado de alta).
- Probar restauración en staging antes de la beta pública:
  1. Restaurar el dump en una base `truco_restore`.
  2. Levantar la app apuntando a esa base y verificar login + una mesa vieja
     (`status finished` visible, sin errores).
  3. Registrar fecha y resultado en `docs/plan-desarrollo-beta.md` (E7).
- Rollback de app: redesplegar la imagen anterior (tag por commit). Las
  migraciones de E2/E4 son solo-creación (aditivas); rollback de código no
  requiere rollback de esquema.

## 6. Métricas de beta (E9)

- `GET /api/admin/metricas?days=7`: mesas creadas, partidas completadas,
  abandonos, registros y promociones guest→cuenta, por día.
- Regla de freno: si las mesas quedan vacías o nadie vuelve en 2 semanas
  seguidas, pausar con `new_tables=false` y revisar antes de invitar más gente.

## 7. Incidentes comunes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `mesas_pausadas` al crear | flag apagado | Revisar `/api/admin/flags` |
| 401 masivos en sockets | `SESSION_SECRET` rotado sin aviso | Avisar: todos reingresan (invitados se recrean solos) |
| Partida "congelada" | timer huérfano tras despliegue | Al reconectar se rearma; si persiste, reiniciar app (estado en DB) |
| Cola de emails crece (`jobs`) | Resend caído o sin API key | Revisar logs `falló envío de job`; reintentan solos |
| Un usuario molesta | conducta | `POST /api/admin/usuarios/:id/ban`; ver `/api/admin/reportes` |
| Reinicio a mitad de partida | despliegue/caída | No hacer nada: al reconectar se recarga desde Postgres (probado en tests) |

## 8. Límites conocidos de esta etapa

- Una sola instancia (rate limit y timers en memoria; sin sticky sessions).
- Sin panel admin web: endpoints + curl (ver §2–§4).
- Sin chat libre: solo saludos predefinidos.
- Moderación manual (reportes + ban).
- WebKit/Safari: cubierto en CI; en local faltan libs del sistema.
