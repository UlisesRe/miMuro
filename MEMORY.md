# MEMORY.md — miMuro

Memoria entre sesiones. Corta (~70 líneas): resumir o borrar lo que ya no aporte.
El plan del muro paso a paso vive acá → sección **Plan: reconstruir el muro**.

## Qué es
Red social joven (público Instagram): cada persona tiene un "muro" y otras entran por un link a
firmar. Hoy: auth + landing + muros del dueño (crear, editar, ver) + **invitados que firman** por link.

## Estado (2026-10-16)
- **Backend**: `User`, `Wall` y `Stroke` + endpoints de muros. Auth, `/api/stats`.
- **Frontend**: landing, login/registro, legales. `/dashboard` = **"Mis muros"** (grid + botón
  "Nuevo muro" con modal: nombre, color del lienzo, público/privado). `/dashboard/w/:id` = muro del
  dueño con dos modos: **Editar** (lápiz/goma, grosor, deshacer, borrar todo, guardar) y
  **Ver** (zoom con rueda/botones, desplazar arrastrando, descargar PNG).
- `/w/:slug` = **muro público** (`pages/PublicWall.js`, sin sesión): se ve en solo lectura con zoom,
  desplazamiento y descarga, y el invitado **firma** (nombre + lápiz + grosor). Respeta
  público/privado: un muro privado da "no existe o es privado".
- El dueño, en su editor, tiene "Copiar link para firmar" y ve la lista de quiénes firmaron.
- Verificación: `npm run build` (28 módulos) · `npm test -- --run` 10/10 · `python -m pytest` 26/26.
- Pendiente: **push** a `origin/main` (el commit ya está hecho).

## Arquitectura
- **Backend** Starlette + SQLAlchemy + SQLite. Todo en `backend/app/main.py`; núcleo en
  `backend/app/core/`; modelos en `backend/app/models/__init__.py`. Sin routers de FastAPI ni Alembic.
  Auth = JWT en cookies httpOnly + `Authorization: Bearer`; `sub` string → `subject_id()`.
- **Frontend** Vite + Alpine (JS plano). `main.js` define stores y registra todo a mano; router propio
  (`router.js`, sin hash); plantillas HTML en `Alpine.store('templates')` inyectadas con `x-html`.
  Cada página expone su propia plantilla (`dashboardPageTemplate`, `wallEditorTemplate`) vía `x-html`.

## Plan: reconstruir el muro

### Hecho
1. **Backend muros** — modelos `Wall` (owner_id, title, slug, background_color, is_public) y
   `Stroke` (wall_id, tool `pen`/`eraser`, color, width, points JSON, `signer_name`). Endpoints en
   `main.py` (validación a mano, sin Pydantic): `GET/POST /api/walls`, `GET/PATCH/DELETE /api/walls/{id}`,
   `PUT /api/walls/{id}/strokes` (**reemplaza** la lista completa), `GET /api/w/{slug}` (solo
   públicos, devuelve `owner_name`) y `POST /api/w/{slug}/sign` (**agrega** trazos de invitado).
   Tests en `backend/tests/test_walls.py`.
2. **Dashboard "Mis muros"** — `pages/Dashboard.js`: grid de tarjetas (color de lienzo + badge
   público/privado), estado vacío, y modal de creación. `wallsApi` en `services/api.js`.
3. **Editar** — `pages/WallEditor.js` (ruta `/dashboard/w/:id`): lápiz/goma, color, grosor,
   deshacer, borrar todo (con confirmación en la barra), guardar. Motor en `utils/wallCanvas.js`.
4. **Ver** — mismo lienzo sin dibujar: zoom (rueda + botones, límite 1×–4× con `transform: scale`),
   pan arrastrando y **descargar PNG** (`canvas.toBlob` sobre un canvas que compone el fondo).
5. **Invitados por `/w/:slug`** — `pages/PublicWall.js` (ya no es cascarón): mismo visor que "Ver"
   (zoom, pan, descargar) + **firmar**: nombre, lápiz y grosor. La firma se envía con
   `POST /api/w/{slug}/sign` y se guarda con `signer_name`. El dueño copia el link desde su editor
   ("Copiar link para firmar") y ve "Firmaron (n)" en el editor y en la página pública.

### Falta (ideas sueltas, sin fase asignada)
- Moderación/anti-abuso de firmas (límite por IP, borrar una firma puntual) y toggle de "aceptar firmas".
- Editar (nombre/color/visibilidad) o borrar un muro desde su tarjeta en "Mis muros" (hoy el `PATCH`
  y el `DELETE` existen pero no tienen UI).
- Compartir el link desde la tarjeta del dashboard, no solo desde el editor.
- Commit + push en `main`.

## Decisiones de implementación del lienzo
- **`WALL_SIZE = 1000`** (espacio lógico fijo) en `frontend/src/utils/wallCanvas.js`. El canvas tiene
  `width/height = 1000` y CSS `width:100%`, así que el mismo dibujo sirve para cualquier tamaño:
  el puntero se convierte con `pointFromEvent()` usando `getBoundingClientRect()`.
- Los trazos son **datos** (`{tool, color, width, points:[x,y,...]}`), nunca píxeles: deshacer,
  borrar todo y la goma operan sobre la lista, y guardar es enviarla completa (`PUT`).
- **Goma** = trazo con `tool:'eraser'` → `globalCompositeOperation='destination-out'`. El color de
  fondo va en el **CSS** del canvas (no es una capa de píxeles), así que la goma lo deja ver y el
  fondo nunca se borra. Al descargar se compone el fondo + los trazos en un canvas aparte.
- Mientras se arrastra solo se dibuja el **último tramo** (`drawSegment`); se repinta todo
  (`renderStrokes`) al cargar, deshacer, borrar y empezar cada trazo (así un toque suelto deja punto).
- Zoom en modo "ver" con `transform: translate(...) scale(...)` sobre el canvas (sin re-render).
- Sin WebSocket: guardar manual con el botón "Guardar" + aviso "Tenés cambios sin guardar".
- **Firmas de invitados**: el invitado solo usa lápiz. Sus trazos viven en `draft` y se envían con
  `POST /api/w/{slug}/sign`, que **agrega** filas con `signer_name` (no reemplaza la lista): dos
  personas pueden firmar sin pisarse. El dueño sigue guardando con `PUT` (reemplaza todo), así que su
  cliente reenvía los `signer_name` que recibió y las firmas no se pierden. El lienzo público redibuja
  `[...strokes, ...draft]`, con el mismo visor que el modo "Ver".
- **`signer_name`** en `Stroke` (`backend/app/models/__init__.py`) + entrada en `_LIGHT_MIGRATIONS`
  (`backend/app/core/database.py`: `ALTER TABLE strokes ADD COLUMN signer_name VARCHAR(60)`), porque
  `create_all()` no agrega columnas a tablas existentes.

## Trampas / aprendizajes
- Alpine (npm): llamar **`Alpine.start()`** al final de `main.js` (1 vez). Sin eso la página queda en
  **blanco** aunque Vite compile.
- Alpine: plantillas con `x-html` NO van en `Alpine.data()`, van en un store. Un `init()` que lee y
  escribe el mismo estado reactivo re-renderiza en bucle → calcular en locales y asignar 1 vez.
  Ojo: dentro de una plantilla JS con backticks, `${...}` lo interpola **JS**; en atributos Alpine
  usar concatenación (`'background-color:' + wall.background_color`).
- Router propio: ruta inexistente = 404 silencioso (las rutas están en `router.js`).
- El `strokes` de la base vieja (`backend/mimuro.db`) ya traía `author_id`/`author_name` de la versión
  anterior: la tabla es la misma, así que **nunca** hay que recrearla; las columnas nuevas van por
  `_LIGHT_MIGRATIONS` (y son idempotentes: `run_light_migrations()` mira qué columnas ya existen).
- `vite.config.js` es la única config (target es2022). No reintroducir `vite.config.ts`.
- Service worker (`public/sw.js`, cache `mimuro-v3`): solo en producción, network-first; en dev
  `main.js` desregistra el viejo. Si dev "no carga", es un SW viejo → desregistrar + limpiar cachés.
- PowerShell 5.1: sin `&&`; textos con acentos solo con las herramientas de edición (UTF-8).

## Decisiones
- Backend mínimo para reconstruir sobre base limpia; diseño "pulido ligero".
- Landing sin `<canvas>`: preview con firmas CSS (fuente Caveat) sobre `--grid-color`.
- Borrado definitivo: `app/api/`, `app/schemas/`, componentes canvas/muro viejos, `debug-wall*.mjs`,
  `README.md`, `docker-compose.yml`, `backend/Dockerfile`, `vite.config.ts` y e2e/Playwright.
