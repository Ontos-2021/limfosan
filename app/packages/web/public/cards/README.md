# Barajas (clásica y propia)

Hay dos barajas disponibles; el jugador elige con el botón del encabezado
("Clásica" / "Propia") y la preferencia se guarda en su navegador.

- **Clásica (por defecto):** los PNG heredados de `TallerAyDS/public/images/`,
  restaurados en esta carpeta por decisión explícita del propietario (2026-09-06).
  Son **36 cartas: faltan los dieces**; esos cuatro 10 se dibujan con el SVG
  propio como reserva.
- **Propia:** el SVG paramétrico original de `src/deck.tsx`, las 40 cartas.

**Estado de derechos:** la procedencia y licencia comercial de los PNG **no
están verificadas**. El propietario autorizó su uso para la evaluación local;
esa autorización no habilita despliegues con usuarios externos (incluida beta
cerrada) ni afirma titularidad. Antes de publicar: verificar licencias o
limitar la baraja clásica. No se copian los fondos fotográficos ni las marcas
del prototipo original.

Si se encarga arte clásico final, debe respetar la caja visual y la API de
`CardFace` (`src/Card.tsx`); el motor y las pruebas no cambian.
