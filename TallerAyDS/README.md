# Truco Project

Proyecto para la asignatura **"Análisis y Diseño de Sistemas"**: juego de Truco con dos jugadores (jugador local contra "Invitado"), construido con Node.js, Express, MongoDB y Socket.io.

## Requisitos

- Node.js (probado con v24)
- MongoDB corriendo en `localhost:27017` (p. ej. `docker run -d --name truco-mongo -p 27017:27017 mongo:4.4`)

## Instalación

```
npm install
```

## Ejecución

```
npm start
```

La aplicación queda disponible en http://localhost:3000.

Alternativamente, para desarrollo sin recarga automática:

```
node ./bin/www
```

## Tests

```
npm test
```

Los tests usan Mocha + Chai y requieren MongoDB en `localhost:27017`.

## Estructura

- `models/` — Motor del juego (`game`, `round`, `deck`, `card`, `player`) y modelos de MongoDB (`user`).
- `routes/` — Rutas de Express (registro, login, lobby, creación de juego, partida).
- `views/` — Plantillas Jade/Pug.
- `bin/www` — Bootstrap del servidor HTTP.
- `test/` — Suites de tests (Card, Deck, Game, Round, User).

## Enlaces útiles

- [Mocha](https://mochajs.org)
- [Chai API](http://chaijs.com/api/bdd/)
- [Lodash](https://lodash.com/docs)
