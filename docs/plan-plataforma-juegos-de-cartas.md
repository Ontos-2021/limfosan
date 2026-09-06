# Plan maestro — Plataforma de juegos de cartas (Truco primero)

> **Estado:** borrador v1 para aprobación · **Fecha:** 2026-09-05
> **Alcance:** reemplaza al plan anterior de multijugador para `TallerAyDS/`. Ese código queda como prototipo y referencia; la producción será una base nueva.
> **Resumen ejecutivo:** construir primero un **Truco argentino confiable, atractivo y cómodo en el celular**, bajo una marca capaz de alojar otros juegos (Carioca, solitarios) con mazos tradicionales de dominio público. Monetización por suscripción y publicidad, sin apuestas. Despliegue en Coolify.

---

## Índice

1. [Decisiones confirmadas](#1-decisiones-confirmadas)
2. [Visión](#2-visión)
3. [Posicionamiento competitivo](#3-posicionamiento-competitivo)
4. [Modelo comercial](#4-modelo-comercial)
5. [Cobros desde Chile](#5-cobros-desde-chile)
6. [Derechos, privacidad y cumplimiento](#6-derechos-privacidad-y-cumplimiento)
7. [Primer producto: Truco argentino 1 vs 1](#7-primer-producto-truco-argentino-1-vs-1)
8. [Experiencia móvil](#8-experiencia-móvil)
9. [Base técnica](#9-base-técnica)
10. [Partidas confiables y seguridad](#10-partidas-confiables-y-seguridad)
11. [Despliegue en Coolify](#11-despliegue-en-coolify)
12. [Presupuesto operativo](#12-presupuesto-operativo)
13. [Calidad y criterios de lanzamiento](#13-calidad-y-criterios-de-lanzamiento)
14. [Ejecución por hitos](#14-ejecución-por-hitos)
15. [Lanzamiento y crecimiento](#15-lanzamiento-y-crecimiento)
16. [Recomendación final y decisiones pendientes](#16-recomendación-final-y-decisiones-pendientes)
- [Apéndice A — Hallazgos de auditoría clave](#apéndice-a--hallazgos-de-auditoría-clave)
- [Apéndice B — Referencias externas](#apéndice-b--referencias-externas)

---

## 1. Decisiones confirmadas

| Aspecto | Decisión |
|---|---|
| Público | Adultos de Latinoamérica (18+) |
| Negocio | Entretenimiento social: **sin apuestas, pozos ni premios canjeables por dinero** |
| Operación comercial | Desde **Chile** |
| Experiencia | Web responsive, **mobile-first** (PWA instalable, funciona sin instalar) |
| Presupuesto operativo adicional | Hasta **USD 50/mes** (email, backups, monitoreo; excluye servidor existente) |
| Desarrollo | El dueño + IA, incremental por hitos |
| Datos actuales | Son de prueba; **base nueva**, sin migración de usuarios |
| Infraestructura | Servidor administrado con **Coolify** (v4.3.17, Traefik) |
| Primer producto | **Truco argentino 1 vs 1** online |
| Juegos futuros | Truco por parejas, solitario (Klondike), Carioca — mazos español/inglés tradicionales |

Correcciones importantes respecto del plan anterior de multijugador:

- El Truco argentino usa **40 cartas** (1–7, 10, 11, 12 por palo). El código actual omite los dieces.
- Escala de apuestas de truco: **truco querido = 2, retruco querido = 3, vale cuatro querido = 4**; rechazar paga 1, 2, 3 respectivamente. (No 2/4/6.)
- Un `username` enviado por el cliente **no** sirve para autenticar una conexión de socket; la identidad debe venir de la sesión verificada del servidor.

---

## 2. Visión

**Propuesta de valor:**

> Jugar a las cartas con amigos, desde cualquier celular, sin instalar nada y sin que los anuncios arruinen la partida.

- **Marca independiente del Truco.** El nombre, dominio y registro de marca se definen antes del lanzamiento, comprobando disponibilidad; no se asume que un nombre genérico esté libre.
- **Tres puertas de entrada:**
  - *Jugar con amigos:* crear una mesa y compartir un enlace por WhatsApp.
  - *Jugar ahora:* encontrar un rival, con alternativa clara de práctica si no hay personas disponibles.
  - *Aprender:* tutorial interactivo y práctica contra un bot identificado como tal.
- **Público:** adultos de Latinoamérica. Lanzamiento inicial en español; Brasil requiere portugués y evaluación específica de sus variantes de Truco (no solo traducir botones).

---

## 3. Posicionamiento competitivo

La competencia ya ofrece multijugador y catálogos amplios:

| Referencia | Oferta comprobada | Implicación |
|---|---|---|
| [Truco Blyts](https://en.blyts.com/truco) | Multijugador, parejas, torneos, funciones sociales; +15 M descargas | "Tener Truco online" no alcanza para diferenciarse |
| [Ludoteka](https://www.ludoteka.com/) | Catálogo amplio, torneos, historial, suscripción Ludo+ | El modelo de plataforma + membresía existe |
| [CardGames.io](https://cardgames.io/) | Juegos tradicionales, acceso sin registro, publicidad | La facilidad de entrada también es una ventaja competitiva |

No se toman cifras de descargas de competidores como estimación de mercado ni prueba de rentabilidad.

**Diferenciación inicial:**

1. **Invitación sin fricción** — abrir un enlace y entrar a la mesa.
2. **Excelente experiencia móvil** — cartas legibles, controles cómodos, cero distracciones.
3. **Confianza** — reglas explícitas, reparto sin manipulación, recuperación ante desconexiones.
4. **Identidad latinoamericana** — lenguaje, barajas y presentación propias, sin aspecto de casino.
5. **Respeto al jugador** — sin energía limitada, sin ventajas comprables, sin bots disfrazados de personas.

**Riesgo comercial inicial principal: no tener jugadores conectados al mismo tiempo.** Por eso las mesas privadas y la práctica importan más que un catálogo amplio.

---

## 4. Modelo comercial

Modelo gratuito con membresía opcional. Las funciones que generan comunidad quedan accesibles gratis.

| Modalidad | Qué ofrece | Cuándo |
|---|---|---|
| **Gratis** | Partidas, mesas privadas básicas, práctica, tutorial, estadísticas esenciales | Desde la beta |
| **Membresía Plus** | Sin publicidad (cuando exista), temas/barajas visuales, estadísticas históricas, personalización | Tras validar uso recurrente |
| **Cosméticos** | Diseños de mesas, dorsos y perfiles; nunca alteran el juego | Más adelante |
| **Clubes** | Grupos, encuentros recurrentes, personalización del club | Cuando existan comunidades activas |
| **Publicidad** | Emplazamientos limitados fuera de partidas activas | Solo con aprobación del proveedor y pruebas de impacto |

**Nunca se cobrará por:** mejores cartas, ayuda en partidas competitivas, prioridad para ganar, ni acceso exclusivo a la cola principal de emparejamiento. Separar jugadores por capacidad de pago daña equidad y emparejamiento.

### 4.1 Suscripción

- Precios **hipótesis** para Chile: **CLP 2.990 y CLP 3.990 mensuales** (a validar con costos de cobro, impuestos y disposición a pagar).
- Comenzar con **un solo plan mensual**. Sin planes vitalicios; anual recién al entender retención y soporte.
- Obligaciones de producto:
  - Precio, moneda y renovación claramente informados.
  - Cancelación sencilla desde la cuenta; acceso hasta fin del período pagado.
  - Manejo de pagos rechazados, reembolsos y contracargos.
  - Registro auditable de cobros y beneficios habilitados.

### 4.2 Publicidad

[Google H5 Games Ads](https://support.google.com/adsense/answer/1705831?hl=es) requiere **aprobación** (no garantizada), y sus [políticas de emplazamiento](https://support.google.com/adsense/answer/9959170?hl=es) restringen anuncios que interrumpen la partida.

Política propia, más estricta que la del proveedor:

- Nunca durante una mano, un canto o una decisión.
- No obligar al rival a esperar mientras otro mira un anuncio.
- Límites de frecuencia; sin audio inesperado.
- Si falla el proveedor o no hay inventario, **el juego sigue funcionando**.
- Nada de pedir clics "para apoyarnos".

**La beta sale sin anuncios.** La integración queda detrás de un feature flag que permite desactivarlos al instante.

### 4.3 Economía inicial (ejemplo ilustrativo, no previsión)

| Supuesto | Resultado mensual |
|---|---:|
| 5.000 MAU, 2 % suscritos, precio ≈ USD 3 | USD 300 brutos |
| 750 usuarios diarios elegibles, 2 oportunidades/día, 70 % fill rate, eCPM USD 1 | USD 31,50 |

Valores para modelar sensibilidad, **no** métricas verificadas. Con audiencia pequeña, la publicidad será complementaria. Cubrir hosting ≠ negocio rentable (faltan trabajo, soporte, comisiones, impuestos, devoluciones, adquisición). Se medirá margen de contribución y retención antes de comprar tráfico o ampliar catálogo.

---

## 5. Cobros desde Chile

**Primera opción a validar:** [Mercado Pago Chile — Suscripciones](https://www.mercadopago.cl/developers/es/docs/subscriptions/overview) (cobros recurrentes, reintentos, gestión de suscripciones).

**Alternativa:** [Transbank Oneclick Mall](https://www.transbankdevelopers.cl/documentacion/oneclick) — resuelve inscripción de tarjeta y cargos, pero **no** es una plataforma de suscripciones completa: el ciclo de cobro y su gestión quedan de nuestro lado.

Se integra **un solo proveedor** al principio. Antes del checkout real hay que confirmar:

1. Alta y requisitos de la persona/empresa chilena.
2. Aceptación de nuestra actividad comercial (juegos sociales).
3. Tarjetas y países desde los que se puede pagar.
4. Moneda de cobro, liquidación, comisiones y restricciones.
5. Tratamiento tributario y boleta electrónica ante el [SII](https://www.sii.cl/destacados/boletas_electronicas/) (boleta expresada en español y pesos; voucher electrónico también es boleta).
6. Procedimientos de cancelación, devolución y soporte.

> Presencia regional de un proveedor **no** implica que una cuenta chilena cobre igual en todos los países. Alcance regional del juego; membresía solo en mercados validados.

**Integración técnica:** beneficios habilitados por confirmaciones verificadas del servidor (nunca por la página de "pago exitoso"). Webhooks con validación de firma (HMAC vía `x-signature`), procesamiento idempotente, consulta del recurso al proveedor, conciliación periódica, manejo de duplicados y eventos fuera de orden. **Nunca se almacenan números completos de tarjeta ni códigos de seguridad.**

---

## 6. Derechos, privacidad y cumplimiento

- Los mazos tradicionales son libres, pero **eso no cubre ilustraciones, marcas ni textos de reglas ajenos**. La [OMPI](https://www.wipo.int/en/web/copyright/faq-copyright) distingue ideas/métodos (libres) de su expresión protegida. Se implementa con medios propios; no se copian recursos comerciales.
- La auditoría encontró recursos actuales **sin licencia documentada** (fotografías con marcas visibles, fondos de ~1 MB, `Thumbs.db` en público). Se reemplazan o verifican individualmente.

**Entregables obligatorios:**

- Barajas y recursos propios o con licencia comercial comprobada.
- Inventario de licencias y atribuciones (dependencias, fuentes, sonidos, imágenes).
- Revisión de marca en Chile y mercados prioritarios.
- Términos de uso, privacidad, política de suscripción, normas de convivencia.
- Procedimiento de acceso, corrección y eliminación de datos.
- Política de retención, proveedores externos y transferencias internacionales.

**Fecha relevante (Chile):** conforme a la disposición transitoria de la [Ley 21.719](https://www.bcn.cl/leychile/navegar?idNorma=1209272) (publicada el 13-12-2024; "primer día del mes vigésimo cuarto posterior"), las modificaciones a la Ley 19.628 rigen desde el **1 de diciembre de 2026**. El producto se diseña ya contemplando esa reforma (derechos de acceso/rectificación/supresión/oposición/portabilidad, deberes de información, seguridad, notificación de incidentes a la Agencia), y se verifica la normativa vigente antes del lanzamiento.

Público adulto reduce problemas pero una casilla "soy mayor de edad" no basta: **datos mínimos** y sin documentos de identidad sin justificación.

Para LATAM: matriz por mercados prioritarios (privacidad, consumidor, publicidad, pagos). No existe un cumplimiento "LATAM" único.

> La revisión legal/contable puntual **no está incluida** en los USD 50/mes de infraestructura: es un costo de puesta en marcha a presupuestar aparte. No se sustituye con texto generado automáticamente.

---

## 7. Primer producto: Truco argentino 1 vs 1

La primera versión comercial es **Truco argentino 1 contra 1**, no toda la plataforma.

| Área | Alcance inicial |
|---|---|
| Acceso | Invitado con sesión segura para juego casual; cuenta verificable para historial persistente y suscripción |
| Mesas | Crear, invitar, entrar, esperar rival, abandonar y volver |
| Juego | Reglas completas de la modalidad elegida, cartas privadas, cantos y puntuación correctos |
| Continuidad | Reconexión, recuperación tras reinicio, política explícita de tiempos |
| Aprendizaje | Tutorial breve, ayuda contextual, práctica contra bot |
| Comunidad | Revancha, invitaciones, mensajes predefinidos, bloqueo, reportes |
| Perfil | Historial, estadísticas básicas, preferencias |
| Operación | Panel administrativo mínimo, soporte, observabilidad |

- El **bot** es sencillo y local (sin costo de IA): decide solo con la información visible para un jugador humano y está identificado como bot.
- **No entra en la v1:** chat abierto, voz, video, torneos complejos, espectadores (costo de moderación/privacidad/abuso alto para un equipo de dos).

### 7.1 Reglamento (correcciones y decisiones)

Correcciones expresas respecto del código y del plan anterior:

- Baraja española de **40 cartas** (1–7, 10, 11, 12 por palo). Jerarquía: 1E > 1B > 7E > 7O > 3 > 2 > 1O/1C > 12 > 11 > **10** > 7C/7B > 6 > 5 > 4. Los 10 y las figuras valen **0** para el envido.
- Puntaje del truco: mano sin cantar **1**; truco querido **2**; retruco querido **3**; vale cuatro querido **4**. Rechazo de cada nivel paga 1, 2, 3.
- La posibilidad de recantar depende de **quién aceptó la subida anterior**, no solo del turno de tirar carta.
- La mano (quién reparte/quién es mano) cambia **al finalizar la mano**, no al crear la ronda siguiente.
- Envido: sin flor inicialmente. Valor = dos cartas del mismo palo + 20 (o la mayor carta si no hay par); figuras y 10 valen 0; empate lo gana la mano.
- Envido rechazado: paga quien **rechazó**, no automáticamente el otro seat.

Decisiones pendientes de fijar antes de programar:

- **Falta envido:** hay variantes publicadas que difieren (Pagat vs Ludoteka). Propuesta concreta: "al resto del puntero" (en buenas, vale lo que le falta **al puntero** para 30; rechazo directo paga 1 o lo acumulado). Debe quedar versionada y validada.
- Objetivo: **30 puntos**, sin flor, una sola modalidad en emparejamiento público. Variantes privadas después.
- Pardas: quién lidera tras parda; triple parda gana la mano.
- "Irse al mazo": puntos según estado de la apuesta.
- Fin inmediato al alcanzar 30 (Flor/Envido pueden cerrar la partida antes del truco).

Cada regla tendrá **pruebas automatizadas**. El reglamento se publica **versionado** en la plataforma y se valida con jugadores experimentados (Pagat y Ludoteka solo como contraste).

---

## 8. Experiencia móvil

La app es una **mesa de juego**, no un dashboard ni un casino con promociones. Barajas originales, buen contraste, tipografía legible, animaciones cortas.

Principios de interacción:

- **Pantalla vertical** como experiencia principal; no obligar a girar el teléfono.
- **Tu mano siempre abajo**, el rival arriba; la perspectiva no cambia con el turno.
- Controles al alcance del pulgar; áreas táctiles ≈ 44–48 px.
- Tocar carta = seleccionar; confirmación de juego + modo rápido opcional.
- Cantos y respuestas visibles sin tapar el estado importante.
- Puntaje, turno y apuesta actual comprensibles de un vistazo.
- Mensajes claros de reconexión, espera y jugada rechazada.
- Sonido opcional, movimiento reducido, teclado y accesibilidad.
- Probado en pantallas chicas, Safari iPhone y Chrome Android.

**PWA instalable** (funciona igual desde el navegador). Modo sin conexión para contenido y práctica/solitario; **una partida multijugador nunca acepta jugadas "offline" ni reenvía decisiones viejas** al reconectar. Las actualizaciones de la PWA no recargan una partida activa; el caché no conserva respuestas privadas.

---

## 9. Base técnica

### 9.1 Por qué no reutilizar `TallerAyDS/` como producción

La auditoría lo justifica: una partida global compartida por todos los usuarios, autorización ausente, mano rival entregada al cliente, mazo de 36 cartas, FSM incompleta, sesiones con secreto literal y MemoryStore, dependencias de 2016, sin Docker ni healthchecks. El detalle está en el [Apéndice A](#apéndice-a--hallazgos-de-auditoría-clave).

### 9.2 Arquitectura propuesta

| Componente | Elección |
|---|---|
| Frontend | **React + TypeScript + Vite** |
| Presentación | HTML/SVG/CSS accesibles (sin motor 3D) |
| Backend | **Node.js LTS + Express moderno + TypeScript** |
| Tiempo real | **Socket.IO 4.x** (mantenido) |
| Base de datos | **PostgreSQL** |
| Acceso a datos | Drizzle + migraciones SQL versionadas |
| Validación | Esquemas compartidos HTTP/sockets (Zod) |
| Pruebas | Unitarias + integración + Playwright (móvil) |
| Distribución | Imagen Docker reproducible |
| Operación | Coolify + Traefik |

- **Un backend** que sirve la web compilada, la API y Socket.IO + PostgreSQL privado. Un dominio simplifica sesiones/cookies/despliegue.
- Páginas públicas prerenderizadas para SEO (sin segundo servidor de render).
- **Sin** Redis/Kubernetes/Kafka/microservicios al inicio. Tareas (email, conciliación, mantenimiento) con trabajos persistidos en PostgreSQL.
- Separación interna clara: identidad, mesas, juegos, resultados, pagos, administración.

### 9.3 Camino hacia plataforma multijuego

Compartir desde el día 1: cuentas, invitaciones, perfiles, pagos, assets de cartas, contratos de comunicación. **No construir un motor universal de reglas antes de tener dos juegos.**

Cada juego implementa su propio estado y el mismo contrato:

```text
crearPartida(configuracion)
accionesPermitidas(estado, participante)
aplicarAccion(estado, participante, accion)
vistaParaJugador(estado, participante)
```

La carta es un dato neutral; su jerarquía la define cada juego. Se preparan identificadores de instancia por carta (necesarios para Carioca: mazos múltiples, comodines) sin implementar el juego todavía.

---

## 10. Partidas confiables y seguridad

**El estado de la partida nunca vive solo en memoria.** PostgreSQL guarda el estado recuperable; la memoria solo coordina.

Procesamiento de una jugada:

1. Identificar al usuario con sesión verificable.
2. Verificar que pertenece a la mesa y puede ejecutar la acción.
3. Validar formato, carta, reglas y versión del estado.
4. Aplicar la transición **sin modificar nada** si es inválida.
5. Guardar estado + acción + resultado en **una transacción**.
6. Confirmar la operación.
7. Enviar a cada participante **solo su vista autorizada**.

- Cada comando lleva **id único** (idempotencia): un doble toque no juega dos veces la misma carta.
- [Socket.IO no garantiza por defecto la entrega de todos los eventos](https://socket.io/docs/v4/delivery-guarantees/); la reconexión del transporte no reemplaza la recuperación del estado.
- Acciones serializadas por mesa; control de concurrencia en la base.
- Estado y reglas **versionados**; resultados registrados una sola vez.
- Reparto con CSPRNG (`crypto`) y barajado uniforme; semillas/mazos completos nunca salen al cliente durante la partida.
- Temporizadores gobernados por el servidor; reconexión sin revelar cartas adicionales.
- Gracia por desconexión acotada (sin pausas infinitas por reconexiones repetidas).
- Incidentes del servidor diferenciados de abandonos del jugador.
- No se promete "cero trampas": se reduce manipulación del cliente y filtraciones; la colaboración externa entre personas requiere controles adicionales.

### Seguridad

- Identidad **por sesión** (no por username del socket); autorización por acción; CORS/origen; CSRF donde aplique; rate limiting; validación estricta de entradas.
- Cuentas con recuperación por email; contraseñas con **Argon2id**; panel admin con **MFA** y auditoría.
- Logs y analítica **sin** contraseñas, credenciales, cuerpos de pagos ni manos privadas.

---

## 11. Despliegue en Coolify

Verificado: Coolify **4.3.17** accesible, proxy Traefik v3.6, hay otras aplicaciones corriendo; **no existe aún** ningún recurso desplegado para este juego. Pendiente de verificar: región física del servidor, capacidad, almacenamiento, conectividad pública y naturaleza del host (`localhost`/host.docker.internal no lo determina). Antes de producción se hace ese inventario y se mide latencia desde los países iniciales.

### 11.1 Organización

- Proyecto nuevo independiente; entornos **staging** y **production**.
- Datos, cuentas y credenciales separados por entorno.
- PostgreSQL **sin exposición pública**.
- HTTPS con dominio propio (Traefik + Let's Encrypt ya configurado).
- Recursos y logs acotados para no afectar otras apps.
- Staging bajo demanda si mantenerlo encendido compromete capacidad.

### 11.2 Entrega de cada versión

```text
Cambio revisado
  -> pruebas y análisis de seguridad
  -> imagen Docker identificada por commit
  -> despliegue en staging
  -> verificación funcional y móvil
  -> aprobación
  -> promoción de esa MISMA imagen a producción
```

- La imagen de producción **no usa nodemon** ni configuración de desarrollo. Usuario sin privilegios, dependencias fijadas (lockfile), healthcheck.
- El healthcheck valida identidad de la app y versión, **no solo HTTP 200** (ya vimos otro proceso responder en el puerto esperado).

### 11.3 Actualizaciones y continuidad

Los [rolling updates de Coolify](https://coolify.io/docs/knowledge-base/rolling-updates) por sí solos no garantizan continuidad de partidas WebSocket (dos procesos con estado independiente = inconsistencias; además, rolling no aplica a deployments Compose y requiere healthcheck).

- **Inicio: reinicio controlado con persistencia y reconexión.** Interrupción breve y visible: se detienen entradas nuevas, cierre ordenado, restauración de partidas sin penalización por el despliegue.
- Antes de correr varias instancias se necesita: asignación de propietario por mesa, distribución de eventos, y si queda long-polling, afinidad de sesiones. Un adaptador Redis no resuelve por sí solo la coordinación del motor.

### 11.4 Backups y recuperación

- Copias **cifradas fuera del servidor** (ej. Cloudflare R2), retención limitada, alertas de fallo.
- **Restauraciones ensayadas** en entorno restringido; procedimiento de rollback de aplicación.
- Migraciones compatibles con la versión anterior cuando corresponda.
- Beta: copias diarias. **Antes de cobrar:** recuperación a un punto en el tiempo; objetivos iniciales RPO ≈ 15 min, RTO ≈ horas — objetivos a demostrar, no garantías vigentes.
- Un solo servidor es un punto único de fallo: **no se venderá SLA empresarial** ni alta disponibilidad que este presupuesto no financia.

---

## 12. Presupuesto operativo

| Concepto | Orientativo mensual |
|---|---:|
| Email transaccional | USD 0–20 |
| Backups externos | USD 0–5 (inicio) |
| Monitoreo y errores | USD 0–5 |
| Dominio (prorrateado) | USD 1–3 |
| Reserva para imprevistos | Hasta completar USD 50 |

Referencias actuales: [Resend](https://resend.com/pricing) tiene plan gratuito de 3.000 emails/mes limitado a 100/día (importante en campañas de registro); [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) tiene franquicia (10 GB, egress gratis) pero el costo depende de uso y retención.

No se cuentan permanentemente con todos los servicios gratuitos: habrá alertas de consumo y un procedimiento para reducir actividad antes de exceder el presupuesto.

**Fuera de este monto:** servidor existente, comisiones de pago, impuestos, asesoramiento profesional, recursos gráficos contratados, publicidad de adquisición.

---

## 13. Calidad y criterios de lanzamiento

| Área | Criterio de salida |
|---|---|
| Reglas | Todos los escenarios del reglamento aprobado cubiertos por pruebas |
| Privacidad | Un cliente no puede obtener cartas o acciones privadas ajenas |
| Autorización | No se puede actuar en otra mesa ni ocupar un asiento ajeno |
| Reintentos | Comandos repetidos no duplican efectos |
| Recuperación | Refresh, cambio de red o reinicio del backend no corrompen la partida |
| Pagos | Duplicados, retrasos, rechazos y cancelaciones resueltos correctamente |
| Móvil | Flujo completo probado en Android e iPhone reales |
| Operación | Backup restaurado y rollback ensayados |
| Seguridad | Sin vulnerabilidades críticas conocidas pendientes en el alcance desplegado |

- Primer ensayo de carga: **50 mesas simultáneas** (memoria, CPU, DB, tiempos). Es una prueba a ejecutar, no una capacidad ya garantizada.
- Web: objetivos Core Web Vitals en condiciones móviles — LCP ≤ 2,5 s, INP ≤ 200 ms, CLS < 0,1.
- Herramientas mínimas de operación: bloquear usuarios, revisar reportes, desactivar anuncios/nuevas partidas, consultar cobros, comunicar incidencias.

---

## 14. Ejecución por hitos

Cada hito termina con algo **demostrable** y criterios de aceptación. Despliegue, seguridad y pruebas nunca quedan para el final.

| Hito | Entrega | Condición para avanzar |
|---|---|---|
| **H0. Definición** | Producto, reglamento, diseño preliminar, derechos, mercados prioritarios, evaluación de cobro chileno | Alcance aprobado y riesgos principales identificados |
| **H1. Base desplegable** | Proyecto nuevo, CI, Docker, PostgreSQL, sesiones, staging | Despliegue reproducible y acceso seguro |
| **H2. Motor de Truco** | Reglas puras, reparto, envites, puntuación, simulaciones | Casos aprobados por jugadores experimentados + pruebas |
| **H3. Multijugador** | Mesas privadas, Socket.IO, privacidad, persistencia, reconexión | Dos dispositivos completan partidas incluso con fallos inducidos |
| **H4. Experiencia móvil** | Mesa definitiva, tutorial, bot, revancha, historial, PWA | Pruebas de usabilidad satisfactorias |
| **H5. Beta operable** | Emparejamiento básico, reportes, administración, monitoreo, restauración | Beta cerrada estable + límites de capacidad medidos |
| **H6. Comercialización** | Plus, checkout validado, conciliación, políticas | Cobro, renovación, cancelación y soporte comprobados |
| **H7. Truco social** | Parejas 2 vs 2, grupos, encuentros | Reglas y privacidad de equipos validadas |
| **H8. Segundo juego** | Solitario Klondike (práctica sin conexión) | Integración sin duplicar cuentas/pagos/plataforma |
| **H9. Carioca** | Modalidad regional definida, mazos múltiples, combinaciones | Motor y UX propios correctamente probados |
| **H10. Expansión** | Más juegos, idiomas o regiones según demanda | Retención, costos y capacidad lo justifican |

**Prioridad interna:** Truco por parejas **antes** de ampliar catálogo (refuerza el producto principal y su componente social). Klondike como segundo juego (no necesita rival). Carioca después (más variaciones, UX móvil más exigente).

Orden de magnitud del primer producto comercial: **varios meses de dedicación sostenida**, no una sesión. El catálogo completo es evolución posterior. Tras H1 y la primera entrega vertical se estimará el ritmo con datos reales.

**Roles:** el dueño lleva decisiones comerciales, validación con jugadores y aceptación de hitos. La IA lleva implementación, pruebas, documentación técnica y preparación de despliegues, sujeta a autorización. Reglas, arte y aspectos legales pueden requerir ayuda humana puntual (sin equipo permanente).

---

## 15. Lanzamiento y crecimiento

1. **Descubrimiento:** entrevistas/pruebas con 15–20 personas del público objetivo antes de invertir en adquisición (¿por qué cambiarían de app? ¿cómo juegan con amigos? ¿qué les molesta de las alternativas?).
2. **Beta cerrada:** grupos invitados; encuentros coordinados para garantizar rivales.
3. **Beta pública acotada:** una modalidad principal; medir reconexiones y soporte.
4. **Membresía piloto:** ofrecida a usuarios que ya vuelven; nunca bloquea el juego gratuito.
5. **Publicidad experimental:** solo con aprobación del proveedor y sin deteriorar la experiencia.
6. **Expansión:** parejas, segundo juego, nuevos mercados según evidencia.

Canales iniciales de bajo costo: enlaces compartidos, comunidades de jugadores, pequeños creadores, contenido original sobre reglas. **No** se empieza comprando instalaciones/visitas indiscriminadamente.

**Métrica principal: partidas humanas completadas por semana.** Complementarias:

- Conversión de invitación → partida.
- Tiempo para encontrar rival.
- % de partidas completadas.
- Retención D1 y D7.
- % de recuperaciones exitosas tras desconexión.
- Reportes por partida.
- Conversión y cancelación de suscripción.
- Ingreso neto y costo operativo por usuario activo.

**Regla de freno:** no se avanza a cinco juegos si el primero tiene mesas vacías o usuarios que no regresan.

---

## 16. Recomendación final y decisiones pendientes

**Recomendación:** construir primero un **Truco confiable, atractivo y cómodo en el celular**, bajo una marca capaz de alojar otros juegos. La plataforma compartida debe **facilitar** la expansión, no retrasar el primer lanzamiento.

**Decisiones pendientes para H0:**

1. **Marca y dominio** (verificación de disponibilidad y registro).
2. **Capacidad y región del servidor** (inventario + latencia desde países iniciales).
3. **Reglamento inicial exacto** (incluye la definición de falta envido; versionado).
4. **Recursos gráficos** (barajas propias o con licencia comercial comprobada).
5. **Viabilidad comercial del proveedor de cobro chileno** (alta, requisitos, comisiones, SII).

Primera ejecución del plan: especificación aprobada + base mínima funcionando en **staging**, dejando intacto el prototipo `TallerAyDS/`.

---

## Apéndice A — Hallazgos de auditoría clave

Auditoría estática del código actual (solo lectura). Referencias con ruta y línea.

| Hallazgo | Referencia |
|---|---|
| Una sola partida global (`g`) compartida por todos; `/newgame` la reemplaza | `TallerAyDS/routes/index.js:8`, `:97–105` |
| La ruta juega como el jugador activo, sin identificar al solicitante | `TallerAyDS/routes/index.js:179–187` |
| Mano rival entregada al cliente ("visible para aprender") | `TallerAyDS/views/play.jade:56–61`, `routes/index.js:143–167` |
| Mazo de 36 cartas: faltan los dieces; peso 0 para el 10; envido trata 11/12 como únicas figuras | `TallerAyDS/models/deck.js:15`, `TallerAyDS/models/card.js:22–27`, `:69–87` |
| Ayuda/plan anunciaban retruco 4 y vale cuatro 6 (incorrecto); el motor **no implementa** retruco ni vale cuatro | `TallerAyDS/routes/index.js:134–140`, `TallerAyDS/views/play.jade:71–97`, `TallerAyDS/models/round.js:25–46` |
| La mano cambia demasiado pronto (al crear la ronda, no al finalizarla); desempates usan la mano ya cambiada | `TallerAyDS/models/game.js:99–102`, `TallerAyDS/models/round.js:334–349` |
| Envido rechazado suma al seat "mano" y no al que rechazó | `TallerAyDS/models/round.js:347–349` |
| Se permite `playcard` con envido/truco pendiente (solo bloqueo visual); permite recantar truco tras querer | `TallerAyDS/models/round.js:29–45` |
| Sesiones: secreto literal en código, MemoryStore, sin Secure/SameSite explícitos; sin CSRF, rate limit ni cabeceras de seguridad | `TallerAyDS/server.js:30–38` |
| Partidas no se persisten (esquemas Mongo exportan constructores de dominio; rutas no guardan) | `TallerAyDS/models/game.js:22–67`, `TallerAyDS/models/player.js:13–46` |
| Socket.IO 1.4.8 declarado e instalado pero **sin integrar**; además, no conservarlo para la nueva base | `TallerAyDS/package.json`, lockfile |
| UI: `.play-card` 500 px fijos, sin media queries; imágenes sin `alt`; recursos sin licencia documentada; Bootstrap/jQuery por HTTP sin integridad | `TallerAyDS/views/style.css:406–416`, `views/play.jade:31–38`, `views/layout.jade:7–12` |
| Despliegue: app en subcarpeta, `npm start` fuerza `NODE_ENV=development` + nodemon, Mongo fijado a `localhost`, sin Dockerfile/healthcheck/CI | `TallerAyDS/package.json:6–8`, `server.js:86` |
| Pruebas: deck test exige 36 cartas (consolida el defecto); `expect(...).to.be.eq-(1)` no assertion; `test/player.rb` es JS no descubierto; helper borra colecciones sin esperar | `TallerAyDS/test/deck.js:7–9`, `test/card.js:39–42`, `test/game.js:275–279`, `test/utils.js:8–30` |

**Reutilizable tras corregir/validar:** separación conceptual carta/mazo/jugador/mano/partida; comparación de cartas y cálculo de envido; escenarios como material de discusión; intención de UX (cartas pulsables, mensajes contextuales); potencialmente cuentas (con migración comprobada — hoy arrancamos limpio).

**Solo referencia/sustitución:** FSM y puntuación, rutas con `g`, autorización, vistas de ambas manos, config de seguridad/despliegue, ayuda de reglas, recursos sin derechos verificados.

---

## Apéndice B — Referencias externas

| Tema | Fuente |
|---|---|
| Reglas Truco argentino (40 cartas, envido, truco 2/3/4, parda, falta envido) | [Pagat — Argentinean Truco](https://www.pagat.com/put/truco_ar.html) · [Ludoteka — Reglas Truco Argentino](https://www.ludoteka.com/juegos/truco-argentino/reglas) |
| Derechos de autor (ideas vs expresión) | [OMPI — FAQ Copyright](https://www.wipo.int/en/web/copyright/faq-copyright) |
| Privacidad Chile (Ley 21.719; entrada en vigor 1-12-2026; Agencia) | [BCN — Ley 21.719](https://www.bcn.cl/leychile/navegar?idNorma=1209272) · [AAIP (AR) como referencia regional](https://www.argentina.gob.ar/aaip/datospersonales/derechos) |
| Suscripciones Mercado Pago (Chile) | [Docs Suscripciones MP CL](https://www.mercadopago.cl/developers/es/docs/subscriptions/overview) · [Webhooks y firma HMAC](https://www.mercadopago.cl/developers/es/docs/subscriptions/additional-content/your-integrations/notifications/webhooks) |
| Cobros recurrentes Chile (alternativa) | [Transbank Oneclick Mall](https://www.transbankdevelopers.cl/documentacion/oneclick) |
| Publicidad en juegos H5 (aprobación y políticas) | [AdSense H5 Games Ads — registro](https://support.google.com/adsense/answer/1705831?hl=es) · [Empezar a usar / políticas](https://support.google.com/adsense/answer/9959170?hl=es) |
| Tiempo real (garantías, múltiples nodos) | [Socket.IO — Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) · [Using multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/) |
| Despliegue | [Coolify — Rolling updates](https://coolify.io/docs/knowledge-base/rolling-updates) · [Health checks](https://coolify.io/docs/knowledge-base/health-checks) |
| Servicios (referencias de costo) | [Resend pricing](https://resend.com/pricing) · [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Boleta electrónica SII (Chile) | [SII — Boleta Electrónica](https://www.sii.cl/destacados/boletas_electronicas/) |
| Competencia | [Truco Blyts](https://en.blyts.com/truco) · [Ludoteka](https://www.ludoteka.com/) · [CardGames.io](https://cardgames.io/) |
