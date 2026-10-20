# MEMORY.md — miMuro

Memoria entre sesiones. Corta (~70 líneas): resumir o borrar lo que ya no aporte.
El plan del muro paso a paso vive acá → sección **Plan: reconstruir el muro**.

## Qué es
Red social joven (público Instagram): cada persona tiene un "muro" y otras entran por un link a
firmar. Hoy: auth + landing + muros del dueño (crear, editar, ver) + **invitados que firman** por link.

## Estado (2026-10-19)
- **Backend**: `User`, `Wall` y `Stroke` + endpoints de muros. Auth, `/api/stats`.
- **Frontend**: landing, login/registro, legales. `/dashboard` = **"Mis muros"**: cada tarjeta muestra
  una **preview JPEG real** del lienzo (fondo + trazos + firmas, sin cuadrícula), el modal de
  crear/editar (nombre, color, público/privado) y un **menú de 3 puntitos** por tarjeta con
  Editar / Reiniciar (borra los trazos) / Eliminar (con confirmación). `/dashboard/w/:id` = muro del
  dueño con dos modos: **Editar** (lápiz/goma, grosor, deshacer, borrar todo, guardar) y
  **Ver** (zoom con rueda/botones, desplazar arrastrando, descargar PNG).
- `/w/:slug` = **muro público** (`pages/PublicWall.js`, sin sesión): header y footer del shell (los
  mismos del inicio), y el invitado **siempre está firmando** (no hay botón "firmar muro"): al entrar
  un modal le pide el **nombre** (se recuerda en `localStorage`), dibuja con lápiz o **goma** (la goma
  solo borra su propio borrador, nunca las firmas de otras sesiones) y botón **Guardar firma**. No hay
  descarga PNG. Respeta público/privado: un muro privado da "no existe o es privado".
- El dueño, en su editor, tiene "Copiar link para firmar" y ve la lista de quiénes firmaron. En el
  dashboard, el menú de 3 puntitos de cada tarjeta tiene **Compartir** (modal tipo hoja social:
  Copiar link, Instagram Stories, Facebook, WhatsApp, X, Telegram).
- **Zoom táctil (pinch) en todos los lienzos**, también en los editables: dos dedos para acercar/mover.
- **Pulido UX/UI + refactor (2026-10-20)**: la mecánica del lienzo (zoom, pan, pinch, punteros, dibujo)
  se movió a `utils/wallInteraction.js`; los modales tienen focus trap, Escape, restauración de foco y
  bloqueo de scroll (`utils/accessibility.js`); íconos y paletas centralizados (`utils/icons.js`,
  `utils/constants.js`); título de la pestaña por página (`utils/documentTitle.js`).
- Verificación: `npm run build` (33 módulos) · `npm test -- --run` 34/34 · `python -m pytest` 28/28.
- Pendiente: **push** a `origin/main`.

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
5. **Invitados por `/w/:slug`** — `pages/PublicWall.js`: el lienzo está **siempre en modo firma**
   (header y footer del shell, no propios) con nombre pedido en un modal al entrar, lápiz o goma,
   grosor, zoom/pan y **Guardar firma**. La firma se envía con `POST /api/w/{slug}/sign` y se guarda
   con `signer_name`. El dueño copia el link desde su editor ("Copiar link para firmar") y ve
   "Firmaron (n)" en el editor y en la página pública.
6. **Tarjetas de "Mis muros"** — preview = JPEG del muro (no la cuadrícula CSS): `renderWallThumbnail()`
   en `utils/wallCanvas.js` compone fondo + trazos en un canvas y devuelve `toDataURL('image/jpeg')`;
   el listado no trae trazos, así que el dashboard pide cada muro en paralelo (`loadPreviews`). Menú de
   3 puntitos: Editar (mismo modal que crear → `PATCH`), Reiniciar (`PUT .../strokes` con `[]`),
   **Compartir** (modal social) y Eliminar (`DELETE`), con modal de confirmación propio (no `confirm()`).

### Falta (ideas sueltas, sin fase asignada)
- Moderación/anti-abuso de firmas (límite por IP, borrar una firma puntual) y toggle de "aceptar firmas".
- Push en `main`.

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
- **Firmas de invitados**: el invitado está siempre firmando. Sus trazos a lápiz viven en `draft` y
  se envían con `POST /api/w/{slug}/sign`, que **agrega** filas con `signer_name` (no reemplaza la
  lista): dos personas pueden firmar sin pisarse. La goma del invitado es **sobre datos**
  (`erasePoints`/`eraseAlong` en `utils/wallCanvas.js`): reescribe solo su `draft`, así nunca borra las
  firmas ya guardadas, y lo que se envía sigue siendo solo lápiz. El muro público se dibuja
  `[...draft, ...strokes]` y ordena las firmas nuevas **debajo** de las anteriores (`displayOrder`:
  invitados más nuevos primero, después las viejas y al final los trazos del dueño). El dueño sigue
  guardando con `PUT` (reemplaza todo) y reenvía los `signer_name` que recibió.
- **Zoom táctil**: gesto de dos dedos implementado a mano con Pointer Events, **en un solo lugar**
  (`utils/wallInteraction.js`: `pointers`, `beginPinch`, `updatePinch`, `clampZoom`), compartido por
  `WallEditor` y `PublicWall`. La rueda/botones siguen andando.
- **Compartir**: el link de firma es `location.origin + '/w/' + wall.slug`; el modal del dashboard abre
  share sheets externos (Facebook/WhatsApp/X/Telegram) y "Copiar link"; Instagram Stories no admite
  deep-link, así que copia el link y abre Instagram.
- **`signer_name`** en `Stroke` (`backend/app/models/__init__.py`) + entrada en `_LIGHT_MIGRATIONS`
  (`backend/app/core/database.py`: `ALTER TABLE strokes ADD COLUMN signer_name VARCHAR(60)`), porque
  `create_all()` no agrega columnas a tablas existentes.

## Pulido UX/UI + refactor (2026-10-20)

- **Módulos compartidos nuevos** (`frontend/src/utils/`):
  - `wallInteraction.js` — `wallCanvasState()` (estado del lienzo) + `mixWallInteraction(componente, opciones)`.
    Concentra zoom/pan/pinch/punteros/dibujo/goma. Cada página aporta hooks (`getStrokes`,
    `getActiveList`, `canDraw`, `eraserEnabled`, `onStrokeStart`, `wheelZoom`, `discardStartedStroke`).
  - `accessibility.js` — `openModal`/`closeModal`/`closeAllModals`/`trapFocus`: guarda quién tenía el
    foco, lo restaura al cerrar, bloquea el scroll del fondo y atrapa el Tab dentro del panel.
  - `icons.js` — todos los SVG en un lugar (`ICONS`, `TOAST_ICONS`), decorativos con `aria-hidden`.
  - `constants.js` — `PEN_COLORS`, `WALL_BACKGROUNDS`, `DEFAULT_INK`, `DEFAULT_BACKGROUND`.
  - `documentTitle.js` — `setDocumentTitle(título)`; `App.js` pone un título por defecto por página.
- **Getters + mezcla**: `mixWallInteraction` usa `Object.defineProperties` +
  `getOwnPropertyDescriptors`. **Un spread o `Object.assign` NO sirve**: al copiar leerían los getters
  (`backgroundColor`, `canvasTransform`, `signerNames`) con `this` vacío y los congelarían en un valor.
- **Tamaños**: `WallEditor.js` 537 → 330 líneas; `PublicWall.js` 587 → 361; la lógica común vive una
  sola vez en `wallInteraction.js`. CSS: 63.05 kB → 59.38 kB (reglas muertas eliminadas: `.faq*`,
  `.btn--soft/--success`, `.card--interactive/__header/__footer`, `.avatar--md/--lg`,
  `.header__icon-btn`, `.user-menu__count/__divider`, `.page--wall`, `.auth__notice`,
  `.auth-form__separator`, `.field__action-label`, `.toolbar__field/__input`, `.feature__text`).
- **Modales**: los 3 del dashboard (`create`/`confirm`/`share`) y el del nombre público usan
  `openModal(this, 'clave')` → buscan `$refs.clavePanel`. El `<div class="modal">` lleva
  `@keydown.tab="trapModal($event, 'clavePanel')"` (o `handleModalTab`). `App.js` llama
  `closeAllModals()` en cada cambio de ruta (un modal no sobrevive a navegar).
- **A11y varios**: `aria-live` en el porcentaje de zoom, `aria-pressed` en herramientas y colores,
  `aria-label` en botones de ícono, el contador de la home se oculta hasta tener número real,
  `prefers-reduced-motion` y `:focus-visible` ya estaban en `base.css`.
- **Tests nuevos**: `utils/wallInteraction.test.js` (10) y `utils/accessibility.test.js` (7). Ojo al
  testear los getters: hay que mezclar con `mixWallInteraction` (como las páginas), no con `Object.assign`.

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
- **`strokes.author_name` NOT NULL legada**: la tabla de la versión anterior en `mimuro.db` tiene
  `author_name VARCHAR(100) NOT NULL` y el modelo `Stroke` (que ya no la usa) no la mapeaba → el
  `PUT /api/walls/{id}/strokes` devolvía **500** al guardar. Los tests no lo ven: `conftest.py`
  crea una DB fresca con `create_all()` del modelo nuevo. Fijo: mapear la columna en `Stroke`
  (`default=""`) y llenarla en `save_strokes` y `sign_wall`.
- **`--reload` trabado**: WatchFiles puede imprimir "Reloading..." y **no** reiniciar el worker →
  sigue corriendo el código viejo. Ojo: los tracebacks leen el texto del archivo **del disco**, así
  que muestran las líneas del código nuevo aunque corra el viejo (enganoso). Si un cambio "no se
  aplica": matar los procesos uvicorn y reiniciar.
- **Render Free bloquea el SMTP saliente** (puertos 25/465/587): `smtplib` falla con
  `OSError: [Errno 101] Network is unreachable` y el correo de confirmación nunca sale. No es
  configuración (`SMTP_HOST`/`SMTP_PASSWORD` están bien): es política del host. Para mails reales hay
  que pasar a una API HTTP (Resend/Brevo, puerto 443); mientras tanto `send_confirmation_email`
  imprime el código en los logs con `[EMAIL][FALLBACK]` cuando el envío falla (y el registro no queda
  a medias). Render también pega en `/` en sus chequeos: por eso existe la ruta `GET /` que devuelve
  un JSON descriptivo (antes quedaba un 404 que parecía un error).
- **Despliegue (Netlify + Render)**: el frontend va a Netlify (`Base directory = frontend`,
  `Publish = frontend/dist`) y el backend a Render (`Root Directory = backend`, start
  `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`). En Netlify la variable
  `VITE_API_BASE_URL` debe incluir el `/api` final (`https://host/api`), porque reemplaza el prefijo
  `/api` del código (`API_BASE`). En Render van `DEBUG=false` (cookies `Secure` + `SameSite=None`),
  `SECRET_KEY` y `DATABASE_URL`. Con `DATABASE_URL=sqlite:///./mimuro.db` los datos se pierden en cada
  deploy (filesystem efímero del plan Free): para persistir hay que pasar a Postgres.
- **Cookies cross-site**: con frontend y backend en dominios distintos, `fetch` necesita
  `credentials: 'include'` (ya está en `api.js`) y el backend `SameSite=None; Secure` (`DEBUG=false`).
  Las `VITE_*` se graban en el build: cambiar una exige redeploy con *Clear cache and deploy site*
  (un deploy normal reusa el bundle viejo). Ojo también con el service worker viejo del navegador.
- **Backend "colgado"**: si el login u otra llamada dan `NetworkError` y la consola del navegador
  no muestra respuesta, casi siempre un uvicorn viejo sigue con el puerto 8000 (acepta conexiones
  pero no responde) y el nuevo no pudo bindear. Verificar con `Get-NetTCPConnection -State Listen
  -LocalPort 8000`, matar esos PIDs y reiniciar `python -m uvicorn app.main:app --reload` desde
  `backend/`. (El `NetworkError` tarda ~90 s porque `api.js` reintenta 3 × 30 s de timeout.)

## Decisiones
- Backend mínimo para reconstruir sobre base limpia; diseño "pulido ligero".
- Landing sin `<canvas>`: preview con firmas CSS (fuente Caveat) sobre `--grid-color`.
- Borrado definitivo: `app/api/`, `app/schemas/`, componentes canvas/muro viejos, `debug-wall*.mjs`,
  `README.md`, `docker-compose.yml`, `backend/Dockerfile`, `vite.config.ts` y e2e/Playwright.
