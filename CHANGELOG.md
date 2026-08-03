# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

## [1.1.0] - 2026-08-02

### Corregido

- **TallerAyDS**: arreglada la creación de un juego. La ruta `GET /newgame` nunca instanciaba el juego (código comentado) y además crasheaba al desreferenciar un usuario `null`, tirando abajo el servidor con `TypeError: Cannot read properties of null`.
- **TallerAyDS**: corregido el ensombrecimiento (shadowing) en `models/player.js` y `models/game.js`. La asignación `var Player = mongoose.model(...)` pisaba el constructor de dominio `function Player(name)`, de modo que `require('./models/player').player` devolvía el modelo de Mongoose en lugar del objeto del motor de juego. Se renombraron los modelos de Mongoose a `PlayerModel`/`GameModel`.
- **TallerAyDS**: reparados los tests de `test/game.js` que dependían del comportamiento anterior (persistencia con `.save()` y estado `currentHand` incorrecto). La suite completa pasa: `13 passing`.

## [1.0.0] - 2026-08-02

### Añadido

- Versión inicial del proyecto **Truco** (TallerAyDS) y del repositorio **Limfosan**.
