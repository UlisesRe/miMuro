# Estética UI: footer a la base, hero y estilo propagado

## Intent

Tres ajustes de estética/presentación pedidos por la persona, sin tocar lógica:
el footer debe quedar pegado a la base de la ventana en PC, el hero respira mejor
con más aire entre sus dos frases, y el tratamiento del título (letra manuscrita
+ círculo de fondo + tipografía combinada) se propaga a otras zonas con cuentagotas,
más burbujas decorativas de fondo con la paleta actual.

## Scope

**In**
1. Footer a la base en PC en la app entera (raíz del layout: `index.html` + `layout.css`).
2. Aire entre "Crea tu muro." y "Haz que lo firmen." (`home.css`).
3. Utilidad `.accent-mark` (primas manuscrita + blob suave, sin gotas ni rotación
   para que el hero siga siendo único) aplicada en 3 títulos, y utilidad `.bubbles`
   (círculos finos de fondo) en 3 fondos (`base.css`, `Home.js`, `auth.css`,
   `AuthForms.js`, `Login.js`, `Register.js`).
4. Columna izquierda de login/registro arranca a la misma altura que el formulario
   (`auth.css`).

**No**
- Nada de la imagen 3 (descartada por la persona).
- Nada de JavaScript de negocio, canvas, backend ni el menú de herramientas.
- No replicar gotas ni rotación del hero en ningún otro título.

## Checklist

- [x] 1. Footer en la base en PC → prueba con Playwright: bottom del footer == alto
      de la ventana en una página corta con footer visible (NotFoundPage),
      viewport 1280x800.
- [x] 2. Aire en el hero → prueba: distancia vertical entre las dos frases medida
      con Playwright: hueco de 5.2 px entre cajas (antes se solapaban).
- [x] 3. `.accent-mark` visible en la marca del CTA y en "firmas" del auth, y
      `.bubbles` en hero, sección funcionalidades y columna de marca →
      `npm run build` sin errores + presencia/estilos verificados en el DOM.
      ("Tres pasos y ya está" quedó SIN estilo, según lo pedido después.)
- [x] 4. Columna de marca arranca a la misma Y que el panel del formulario →
      prueba: `brandTitle.top` 97 px == `panel.top` 97 px en viewport 1280x900.
- [x] 5. Regresión visual básica → build OK + mediciones Playwright; falta la
      revisión visual de la persona en el navegador.

## Evidence

`npm run build` (vite): 32 módulos, sin errores.
Playwright (Chromium, `vite preview` sobre el build de producción):

```
footer:        viewport 800, footerBottom 800  → anclado a la base ✓
heroGap:       5.2 px entre "Crea tu muro." y "Haz que lo firmen." ✓
pasos:         "Tres pasos y ya está" sin .accent-mark ✓ (revertido a petición)
accent-mark:   presente en CTA y en "firmas" del bloque auth ✓
bubbles:       .bubbles en sección funcionalidades y en .auth__brand ✓
hero::after:   anillo decorativo dibujado ✓
auth:          brand-title top 97 px == panel top 97 px ✓
móvil:         footerBottom 844 == fin del documento (390x844) ✓
```

Resultado de la primera pasada (descartado): /privacy era más alto que la
ventana → footer correctamente al final del contenido, no anclado; se repitió
la prueba con una página corta.

## Next

La persona revisa en el navegador: Home (hero, pasos, funcionalidades, CTA),
"mis muros" (footer a la base), login y registro (columna alineada).
