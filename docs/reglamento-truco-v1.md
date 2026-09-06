# Reglamento Truco argentino 1v1 — v1

> **Versión:** v1 · **Fecha:** 2026-09-06 · **Estado:** borrador para validar con jugadores experimentados
> **Alcance:** partida individual 1 contra 1, a 30 puntos, **sin flor**. Única modalidad pública de la beta.
> **Validez de reglas:** las pruebas del motor ([`app/packages/juego-truco`](../app/packages/juego-truco), E3) deben cubrir todos los casos normativos de la sección 8.

Referencias de contraste: [Pagat](https://www.pagat.com/put/truco_ar.html) · [Ludoteka](https://www.ludoteka.com/juegos/truco-argentino/reglas).
Ante cualquier duda de implementación, **este documento manda**.

---

## 1. Baraja y reparto

- Baraja española de **40 cartas**: 1–7, 10 (sota), 11 (caballo), 12 (rey) de cada palo (oros, copas, espadas, bastos).
- Se reparten **3 cartas por jugador**. El resto del mazo no se usa durante la mano.
- La **mano** (quién reparte el orden de juego) **alterna al finalizar cada mano**, no al crear la ronda siguiente. La mano sale primero en la primera baza y gana todos los empates de envido y de pardas triples.

## 2. Jerarquía de cartas (de mayor a menor)

| Posición | Cartas |
|---|---|
| 1 | 1 de espadas |
| 2 | 1 de bastos |
| 3 | 7 de espadas |
| 4 | 7 de oros |
| 5 | Los treses (3O = 3C = 3E = 3B) |
| 6 | Los doses |
| 7 | Ases falsos: 1 de oros, 1 de copas |
| 8 | Los reyes (12) |
| 9 | Los caballos (11) |
| 10 | Las sotas (10) |
| 11 | Sietes falsos: 7 de copas, 7 de bastos |
| 12 | Los seises |
| 13 | Los cincos |
| 14 | Los cuatros |

- Fuera de las 4 cartas bravas, **solo importa el rango**: dos cartas iguales de palos distintos empatan en la baza.
- Para el **envido**, las figuras (10, 11, 12) valen **0**.

## 3. Bazas y pardas

- Cada mano se juega en hasta **3 bazas**. Gana la mano quien gana **2 bazas**.
- La mano sale en la primera baza. El ganador de cada baza sale en la siguiente.
- **Baza parda:** si la(s) carta(s) más alta(s) de la baza las juegan jugadores distintos (empate), la baza no la gana nadie. Sale en la baza siguiente quien salió en la parda.
- Resolución con parda:
  - Si una de las primeras dos bazas es parda, gana quien ganó la otra baza (la tercera no se juega si el resultado queda decidido).
  - Si las tres bazas son pardas, **gana la mano**.
- **Puntos de la mano (truco):** sin cantar = **1 punto** para el ganador.

## 4. Truco, retruco y vale cuatro

### 4.1 Valores

| Canto | Si se quiere | Si no se quiere |
|---|---|---|
| Truco | la mano vale **2** | quien cantó suma **1** |
| Retruco | la mano vale **3** | quien cantó el retruco suma **2** |
| Vale cuatro | la mano vale **4** | quien cantó el vale cuatro suma **3** |

- El truco puede cantarse en cualquier momento de la mano, incluso antes de tirar la primera carta.
- **Solo puede recantar quien aceptó la subida anterior.** Concretamente:
  - Truco aceptado → solo el jugador que dijo *quiero* puede cantar **retruco**.
  - Retruco aceptado → solo el jugador que dijo *quiero* al retruco puede cantar **vale cuatro**.
  - Vale cuatro no admite más subidas.
- Una subida pendiente **bloquea** tirar carta del que debe responder: primero responde (quiero / no quiero), o si tiene derecho, sube; recién entonces sigue la mano. Jugar carta no equivale a aceptar.
- El envido tiene prioridad: ante truco pendiente, el jugador puede abrir envido primero; el truco queda en espera hasta resolver el envido.
- Irse al mazo con truco pendiente equivale a **no quiero**: el rival suma lo correspondiente al nivel pendiente (1, 2 o 3 según tabla).

### 4.2 Fin de la mano por rechazo

- Al rechazar un canto, la mano **termina de inmediato**: nadie más tira cartas y se suman los puntos de la tabla.
- Vale cuatro aceptado: se juega la mano por 4 puntos; no hay más cantos posibles.

## 5. Envido

- Valor de envido de un jugador: si tiene **dos cartas del mismo palo**, suma sus índices (figuras y 10 valen 0) **+ 20**. Si las tres son de palos distintos, vale la carta más alta (figuras/10 = 0). Máximo posible: 33 (7+6 del mismo palo + 20).
- **Empate de envido: gana la mano.**
- El envido solo puede abrirse **en la primera baza**: antes de tirar la primera carta propia, o al responder un truco pendiente de la primera baza. Pasada la primera baza de ambos, no hay envido.
- Los puntos del envido se suman **de inmediato** y pueden cerrar la partida (el truco pendiente que pueda existir ya no se juega).

### 5.1 Cadena de envidos

| Canto | Valor que propone |
|---|---|
| Envido | 2 |
| Envido (réplica al envido) | +2 (acumulado 4) |
| Real envido | +3 |
| Falta envido | **el resto del puntero** (ver 5.2) |

- Reglas de encadenado:
  - Envido puede responderse con: quiero, no quiero, **envido** (+2), **real envido** (+3), **falta envido**.
  - Envido-envido (doble) puede responderse con: quiero, no quiero, **real envido** (+3), **falta envido**. No admite un tercer envido.
  - Real envido puede responderse con: quiero, no quiero, **falta envido**. No admite más envidos ni otro real.
  - Falta envido **cierra la cadena**: solo admite quiero o no quiero.
- **Rechazo:** si se rechaza un canto, quien cantó suma **lo ya acumulado hasta ese momento** (si el rechazo es al primer envido: 1 punto). Rechazar nunca otorga el valor del canto rechazado.
- **Aceptación:** quien gane el envido (por puntos, desempate a la mano) suma **todo lo acumulado**.
- **Orden de anuncio:** canta los puntos la mano primero; el rival solo anuncia si supera, si iguala la mano (la mano gana) o si dice "son buenas".

### 5.2 Falta envido — "al resto del puntero" (v1)

- Falta envido querida vale exactamente **lo que le falta al puntero para llegar a 30**: `30 − max(puntosA, puntosB)`.
- Ejemplos:
  - 24–18, gana el de 18 → suma `30 − 24 = 6` (no 12).
  - 29–17, gana el de 17 → suma `30 − 29 = 1`.
  - 29–28, gana el de 28 → suma 1.
- **La falta querida sustituye lo acumulado** (no suma envidos previos encima del resto).
- Falta envido rechazada directamente: **1 punto** para quien la cantó. Si hubo subidas aceptadas antes, el rechazo paga lo acumulado hasta ese momento.

### 5.3 Prioridad envido frente a truco

- Si hay truco pendiente y un jugador abre envido, el truco **espera**. Se resuelve el envido completo; luego se responde el truco pendiente.
- Si el envido cierra la partida (alguien llega a 30), el truco no se juega ni se puntúa.

## 6. Irse al mazo

- Un jugador puede irse al mazo en su turno, en lugar de tirar carta o responder un canto.
- Sin cantos pendientes: el rival suma **1 punto** (la mano).
- Con canto pendiente: equivale al **no quiero** de ese canto (tabla 4.1).
- Con canto ya aceptado (truco/retruco/vale cuatro querido): el rival suma **el valor aceptado** (2, 3 o 4).

## 7. Cierre de partida

- La partida termina **de inmediato** cuando un jugador alcanza **30 puntos o más**, sea por truco o por envido. No se juega el resto de la mano.
- Puntuación intermedia: hasta 14 = "malas", desde 15 = "buenas" (informativo; no cambia reglas).
- Ganador: el primero en llegar a 30. Sin empates posibles (el puntaje que cierra se asigna antes de seguir jugando).

## 8. Casos normativos (deben estar en las pruebas del motor, E3)

### Baraja y jerarquía
- R1. El mazo tiene exactamente 40 cartas (10 valores × 4 palos).
- R2. 1E > 1B > 7E > 7O > 3 > 2 > 1O/1C > 12 > 11 > 10 > 7C/7B > 6 > 5 > 4.
- R3. 10, 11 y 12 valen 0 para el envido.

### Bazas y pardas
- R4. Mano sin cantar vale 1; ganador de 2 de 3 bazas.
- R5. Parda en primera baza + victoria en segunda → gana el de la segunda; la tercera no se juega.
- R6. Tres pardas → gana la mano.
- R7. Gana la primera baza, pierde la segunda, gana la tercera → victoria 2–1.
- R8. Empate de cartas iguales en la baza entre ambos → parda.

### Truco
- R9. Truco querido → la mano vale 2.
- R10. Truco no querido → quien cantó suma 1 y la mano termina.
- R11. Quiero al truco → solo el que aceptó puede retrucar. El otro no puede retrucar.
- R12. Retruco querido → la mano vale 3; no querido → quien lo cantó suma 2.
- R13. Quiero al retruco → solo el que aceptó puede cantar vale cuatro.
- R14. Vale cuatro querido → la mano vale 4; no querido → quien lo cantó suma 3.
- R15. Con canto pendiente, tirar carta está prohibido para quien debe responder.
- R16. Mazo con truco pendiente = no quiero (paga 1/2/3 según nivel).

### Envido
- R17. Envido querido = 2 para el mejor (desempate a la mano); no querido = 1 para quien cantó.
- R18. Envido + envido querido = 4; envido + envido no querido = 2 para el primer cantor.
- R19. Envido + real querido = 5 (2+3); rechazado = 2 para el primer cantor.
- R20. Real directo querido = 3; rechazado = 1.
- R21. Envido + real + real querido = 8 (2+3+3); rechazado el último = 5.
- R22. Cadena inválida: envido → envido → envido (tercer envido) **rechazado por el motor**.
- R23. Cadena inválida: real → envido **rechazado por el motor**.
- R24. Envido después de la primera baza de ambos **rechazado por el motor**.
- R25. Cálculo: 7E+4E+6O = 31; 5B+RB+CB (RB,CB figuras=0) = 25; 6B+3O+RE = 6.
- R26. Anuncio: la mano canta primero; el rival no necesita revelar si pierde.

### Falta envido
- R27. 24–18, gana el de 18 → +6. Rechazo directo → +1 al cantor.
- R28. 29–17, gana el de 17 → +1 y **cierra la partida** (30).
- R29. Falta querida **sustituye** lo acumulado (envido→falta querida en 20–20 gana el envido → +10, no 12).
- R30. Envido→real→falta rechazada → +5 al último cantor previo (2+3).
- R31. Falta cierra la cadena: falta → real **rechazado por el motor**.

### Prioridad y cierre
- R32. Truco pendiente + envido abierto + envido cierra partida → el truco no se juega.
- R33. Truco pendiente + envido resuelto sin cerrar → se responde el truco pendiente.
- R34. Envido que lleva a 30 en mitad de mano → partida terminada, no se tiran más cartas.
- R35. Mano alterna al finalizar cada mano (verificar en 3 manos consecutivas).
- R36. Acción inválida (carta que no posee, canto fuera de momento) **no muta el estado** y devuelve error.
