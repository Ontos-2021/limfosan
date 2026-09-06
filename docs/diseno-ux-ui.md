# Diseño UX/UI: mesa de Truco

> **Actualización 2026-09-06 (3ª iteración, E2+E4):** además de la partida
> local, hay **juego online real**: lobby (crear/unirse por código), mesa con
> snapshots por asiento, temporizadores, reconexión verdadera, revancha entre
> humanos y diálogo de cuenta (invitado/registro/login). El modo local sigue
> intacto como puerta de entrada sin red.

## Estado y dirección aprobada

La dirección aprobada es una interfaz limpia y moderna, con Truco como primer juego y una base visual reutilizable para futuros juegos de cartas. Hay dos modos: **partida local contra CPU** (reglamento v1, sin red) y **partida online** (motor autoritativo en servidor, persistencia Postgres, sesiones). La mesa local conserva su simulación de reconexión identificada como tal; en online la reconexión es real.

Lo que ya es juego real: reparto con semilla reproducible (`?seed=N`) en local; online con reparto del servidor, bazas y pardas, envido con cadena completa (incluida falta envido "al resto del puntero"), truco/retruco/vale cuatro con la regla de recante por aceptante, mazo con previsualización de puntos, cierre a 30 y revancha (nueva partida local o nueva mesa compartida).

Lo que sigue fuera de alcance: emparejamiento automático ("jugar ahora"), tutorial guiado, PWA instalable, chat libre (solo saludos predefinidos) y espectadores.

## Alcance actual y futuro

| Área          | Implementado ahora                                                | Integración futura, fuera del alcance actual           |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Mesa y cartas | Local: motor v1 en cliente. Online: snapshots por asiento         | Emparejamiento, tutorial, PWA (E5–E6)                  |
| Acciones      | Selección/confirmación, cantos contextuales, comandos idempotentes| Cola "jugar ahora", torneos                            |
| Rival         | CPU local o persona remota (presencia en línea)                   | Ranking, bloqueos entre pares (E6)                     |
| Escenarios    | Local: simulación. Online: reconexión real con gracia             | —                                                      |
| Datos         | Local efímero. Online: Postgres + sesiones + cuentas              | Historial visible, estadísticas (E6)                   |

No hay suscripciones ni publicidad en esta etapa. El modo online requiere backend;
sin conexión, la app ofrece igual la partida local.

## Lenguaje visual

- Usar una envolvente crema o marfil con superficies y jerarquías claras, sin ruido decorativo.
- Reservar el verde bosque oscuro para la mesa, con contraste suficiente para cartas, indicadores y acciones.
- Combinar una tipografía serif de exhibición para títulos con tipografía de sistema para texto, controles y mensajes.
- Mantener una base reutilizable de colores, espaciado, botones y paneles, sin diluir las necesidades concretas de Truco ni construir ahora una plataforma multijuego.
- Priorizar la mano propia y la acción disponible sobre el contenido explicativo.

## Composición adaptable

En móvil vertical, la mesa ocupa el foco principal y la mano propia se ubica abajo. Las acciones deben quedar próximas a la mano y ser alcanzables sin tapar las cartas. La ayuda y los controles de escenario pueden desplegarse en paneles, sin exigir orientación horizontal ni desplazamiento horizontal de toda la página.

En escritorio, conservar la mano propia abajo y distribuir el contenido explicativo, la ayuda y los controles de escenario en una barra lateral. La mesa debe seguir siendo el elemento dominante.

El rival se presenta en el extremo opuesto con cartas ocultas y una etiqueta visible como **«Rival simulado local»**. No usar estados de presencia o mensajes que sugieran una persona conectada. Indicar también que se trata de una demo local y que sus resultados son simulados.

## Interacciones

### Seleccionar y confirmar una carta

1. Activar una carta de la mano para seleccionarla, sin jugarla inmediatamente.
2. Mostrar una selección inequívoca, no dependiente solo del color, y permitir cambiarla o cancelarla.
3. Habilitar un botón explícito de confirmación, por ejemplo «Jugar carta», cuando el escenario lo permita.
4. Al confirmar, actualizar el estado visual local e informar la acción. Evitar envíos duplicados y conservar un foco útil si la carta deja de estar en la mano.

Las cartas seleccionables y las acciones deben ser botones HTML reales, con nombre accesible, foco visible y operación mediante teclado y tacto. No sustituir botones por elementos genéricos con manejadores de clic.

### Cantos y respuestas contextuales

Mostrar los cantos y las respuestas que correspondan al estado de ejemplo: por ejemplo, «Quiero», «No quiero» o una subida cuando el escenario la contemple. Explicar quién debe responder y qué está pendiente. No presentar todas las acciones permanentemente como si fueran válidas.

La disponibilidad actual proviene del guion de la demo. No equivale a una validación completa del reglamento ni a una decisión autoritativa del juego. Los controles no disponibles deben omitirse o comunicar claramente por qué están deshabilitados.

### Ayuda y escenarios

Ofrecer ayuda accesible desde la mesa que explique cómo seleccionar y confirmar, qué significa una respuesta y cuáles son los límites de la simulación. Mantener la explicación extensa fuera de la zona principal de juego.

Un control identificado como **«Escenarios de la demo»** debe permitir explorar al menos:

- Turno propio con selección y confirmación de carta.
- Espera y respuesta del rival simulado local.
- Canto pendiente con respuestas contextuales.
- Reconexión simulada, con aviso explícito de que no hay conexión real, acciones de juego bloqueadas durante ese estado y una forma de continuar o reiniciar.
- Final de mano o partida, con resultado de ejemplo y una acción clara para reiniciar la demo.

Cambiar de escenario debe restablecer selecciones y mensajes transitorios incompatibles con el nuevo estado. La simulación nunca debe dejar al usuario sin salida ni presentarse como un mecanismo real de reconexión.

## Accesibilidad y movimiento

- Garantizar objetivos táctiles de al menos **44 × 44 píxeles CSS**, también en cartas seleccionables y controles de paneles, sin zonas de activación solapadas.
- Mantener contraste legible, foco visible y orden de tabulación coherente. No comunicar turno, selección o resultado únicamente mediante color.
- Proporcionar nombres accesibles para cartas propias y controles; comunicar la selección, por ejemplo mediante `aria-pressed`, además de su apariencia.
- Anunciar cambios relevantes de turno, acción y estado de forma no intrusiva, sin saturar las tecnologías de asistencia.
- Gestionar el foco al abrir y cerrar paneles o diálogos, permitiendo cerrarlos con teclado y volver al control de origen.
- Respetar `prefers-reduced-motion`: eliminar desplazamientos y animaciones no esenciales. Ninguna interacción debe depender de una animación para entenderse o completarse.

## Baraja dual: clásica (PNG heredados) y propia (SVG)

Desde el 2026-09-06 conviven dos barajas con un toggle en el encabezado
("Clásica" / "Propia"; la preferencia se guarda en `localStorage`):

- **Propia (SVG):** diseño paramétrico original en `app/packages/web/src/deck.tsx`,
  las 40 cartas, sin imágenes de terceros. Es la reserva obligatoria de los
  dieces y una alternativa estética completa.
- **Clásica (PNG heredados):** restaurada por decisión explícita del propietario
  para la evaluación local. Cubre 36 cartas; **los cuatro dieces no existen en
  ese set y siempre se dibujan con el SVG propio** (fallback transparente en
  `CardFace`).

**Estado de derechos de los PNG:** sin verificar. La autorización del dueño
cubre el uso local; no habilita despliegues con usuarios externos ni afirma
titularidad. Antes de publicar: verificar licencias de cada PNG o dejar la
clásica deshabilitada. Detalle en `app/packages/web/public/cards/README.md`.
El prototipo original permanece intacto en `TallerAyDS/`.

## Integración futura y privacidad

La futura partida real debe consumir un snapshot específico para cada usuario y una lista `allowedActions` calculada por un servidor autoritativo. El cliente representa ese estado y solicita acciones; el servidor valida identidad, turno, legalidad y vigencia de cada solicitud antes de resolverla. Ocultar o deshabilitar un botón no es una medida de seguridad suficiente.

El snapshot solo debe incluir la mano propia y la información pública o expresamente revelada según las reglas. Para el rival, enviar únicamente la cantidad de cartas u otros datos públicos necesarios. **No enviar cartas secretas al cliente para ocultarlas mediante CSS**, atributos, elementos fuera de pantalla o etiquetas accesibles. En la demo, representar la mano oculta con reversos o marcadores, sin identidades secretas incrustadas en el DOM.

La reconexión real deberá recuperar un snapshot autorizado vigente y sus `allowedActions`, descartando selecciones locales obsoletas. Los controles de escenarios son herramientas de la demo y no deben convertirse en una forma de alterar el estado autoritativo de una partida real.

## Plan de verificación

**Motor (juego real):** 40 pruebas unitarias contra los casos R1–R36 del
reglamento v1, más simulación de **1500 partidas aleatorias** y verificación de
determinismo del bot. Todas en verde (`npm test -w @limfosan/juego-truco`).

**Interfaz:** 14 pruebas Playwright en Chromium de escritorio y Chromium móvil
(360 × 740): partida completa con cantos, envido rechazado que suma, respuesta
al truco de la CPU, mazo con confirmación, reconexión que pausa de verdad
(las acciones se deshabilitan), diálogo/teclado, movimiento reducido y fallo
del healthcheck. Capturas en `app/packages/web/test-results/` (no versionadas).
Se verificó que el botón de jugar quede dentro del viewport de 740 px de alto.
**La prueba en un dispositivo móvil físico aún no se ha realizado.**
WebKit está configurado en CI; su ejecución local requiere las bibliotecas
`libevent-2.1-7t64` y `libmanette-0.2-0`, ausentes en este host.

| Entorno o área                      | Comprobaciones previstas                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium en escritorio              | Composición de mesa y barra lateral, selección y confirmación, respuestas contextuales, ayuda, cambio de escenarios y ausencia de errores de consola               |
| WebKit                              | Mismos recorridos funcionales, disposición de cartas, fuentes, foco y paneles; registrar navegador y versión realmente utilizados                                  |
| Viewports móviles verticales        | Mano inferior utilizable, controles sin solapamientos, objetivos de 44 × 44 píxeles CSS y ausencia de desbordamiento horizontal                                    |
| Dispositivo móvil físico, pendiente | Tacto real, legibilidad, desplazamiento, áreas seguras y apertura/cierre de paneles; la emulación no sustituye esta prueba                                         |
| Teclado y tecnología de asistencia  | Nombres accesibles, orden y restauración del foco, selección anunciada, botones operables y ausencia de información secreta                                        |
| Movimiento reducido                 | Recorrer la demo con `prefers-reduced-motion` activo y comprobar que no depende de animaciones                                                                     |
| Estados y límites                   | Rival identificado como simulado, reconexión explícitamente ficticia, final reiniciable y ausencia de promesas de red, persistencia, autenticación o suscripciones |

Al ejecutar las pruebas, registrar entorno, recorrido, resultado y defectos pendientes. Solo describir capturas o verificaciones como realizadas cuando exista evidencia real.

## Verificación del contenedor local

Verificación vigente (2026-09-06, partida real): la imagen se reconstruye con el
motor integrado y se publica solo en loopback (`http://localhost:3101/`);
healthcheck `healthy` y prueba Chromium contra el contenedor que juega una
carta, recibe la respuesta de la CPU y no registra errores de JavaScript.
Contenedores anteriores quedan detenido como respaldo (`limfosan-app-*-backup`).
No se desplegó en Coolify ni se publicó al remoto.

Pendiente técnico independiente del diseño: `npm audit --omit=dev` reportó tres
avisos moderados relacionados con `qs` y su cadena de dependencias de Express.
`npm update qs` y `npm audit fix` no los resolvieron. No se forzaron actualizaciones
mayores. Revisar dependencias antes de habilitar acceso externo.
