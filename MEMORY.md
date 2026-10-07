# MEMORY.md - miMuro

memoria del proyecto entre sesiones. Máximo ~50 Líneas: resume o elimina lo que ya no aporte.

## Estado actual
- v1, vRegister, vLogin, vDashboard "mis muros" y backend: funcionando (registrarse, login,
  confirmación por correo, guardar trazos, CRUD de muros).

## Sesión 2026-10-07 (cerrada)
- [x] Bug 404 tras confirmar correo: AuthForms.js navegaba a '/mis-muros' → '/dashboard'.
- [x] Toolbar → paleta flotante redonda y arrastrable. Motivo real del bug "no cambia el
      color": overflow-x: auto recortaba el dropdown viejo.
- [x] Muro público: fuera immersive + lienzo enmarcado (PublicWall.js + app.css).
- [x] Crear muro ya NO navega; eliminada la página WallView (`/wall/:id`) y su ruta.
- [x] Lienzo cuadrado 1080x1080 lógico (useCanvas.js): buffer fijo, fitFrame + applyTransform
      escalan al espacio disponible, grid 90/1.5 lógicos, getPointFromEvent escala a lógico.
      Grosores lógicos LINE_WIDTHS [3,6,10,15,21,28] default 10 (Toolbar.js).
- [x] Cabecera/footer SIEMPRE visibles: .wall-overlay y .wall-enter con
      inset calc(header-height + safe-top) 0 --overlay-bottom 0; --overlay-bottom lo mide
      utils/overlayInsets.js (.footer → ResizeObserver); chrome encima con
      [data-wall-overlay=true] .footer z overlay+1 y .tabbar z overlay+2 (attr en AppTemplate).
- [x] Barra Ver/Editar simplificada: título+badge a la izquierda; Reiniciar/Eliminar
      (icono+label, label oculto <640px vía .btn__label) y X a la derecha. Fuera "Editar
      datos"/"Compartir link" (EditWallForm queda inalcanzable, código intacto).
- [x] Ver (modo view): JPG render cuadrado 1080x1080 en stage enmarcado (WallOverlay.js
      renderWallJpg ya no recorta bbox; overlay__image max-w/h 100% + margin auto).
- [x] Paleta: arranca abajo-derecha dentro del lienzo; clamp superior = bottom del header,
      inferior = mínimos visibles de barriers (local primero, si no global).
- [x] Verificar: `npm run build` OK (32 módulos). pytest no hace falta: no se tocó backend.
- [ ] Commit + push en main (pendiente).

## Decisiones (y porqué)
- Espacio lógico fijo 1080²: mismo muro en cualquier dispositivo (solo zoom para ajustar).
  Strokes viejos de la DB estaban en CSS px → quedan corridos; recomendar "Reiniciar".
- La paleta no persiste posición; tope arriba = header (nunca lo tapa), no el navegador.
- Modales z600 (crear/editar) NO se insetan: son diálogos, no capas de página.
- `--overlay-bottom` por JS porque el footer wrappea y su altura no es fija en CSS.

## Aprendizajes y errores a evitar
- overflow-x: auto recorta dropdowns absolute → herramientas invisibles en móvil.
- navigate() con ruta inexistente = 404 silencioso: las rutas están en router.js.
- No navegar después de crear; WallView era redundante con el overlay de edición.
- Opciones destructuradas como const en useCanvas: setBackgroundColor rompía → let.

## Próximos pasos
- Limpiar strokes viejos de la DB (corridos por cambio a espacio lógico 1080²; migrar o recomendar "Reiniciar").
- Compartir muro: terminar/revisar flujo de ShareWallModal y acceso por link público.
- Tests backend: correr pytest y ampliar cobertura.
- Perfeccionar herramienta de dibujo / funcionalidad del dibujo y pantallas de lienzo abierto (frontend).
