# Documentación legal (AkoeNet)

Índice de los textos legales del proyecto. Los Markdown viven en **`docs/legal/`** y el **cliente web** los muestra en rutas públicas (`/legal/...`).

## Archivos

| Documento | Archivo |
|-----------|---------|
| Política de privacidad | [`PRIVACIDAD.md`](./PRIVACIDAD.md) |
| Términos y condiciones | [`TERMINOS_Y_CONDICIONES.md`](./TERMINOS_Y_CONDICIONES.md) |
| Protección legal (marca, licencia, descargos) | [`PROTECCION_LEGAL.md`](./PROTECCION_LEGAL.md) |

## En la aplicación web

Tras compilar o ejecutar el frontend de Vite:

- `/legal/privacidad` — política de privacidad  
- `/legal/terminos` — términos y condiciones  
- `/legal/proteccion` — protección legal  

La **landing pública** y el **pie de página** enlazan a estas rutas.

## Antes de producción

Sustituye los placeholders de contacto (`[CONTACTO_LEGAL]`, `[CONTACTO_PRIVACIDAD]`, etc.) en los Markdown y revisa el texto con asesoría jurídica si el servicio es público.

## Copyright y aviso corto en el cliente

- **Pie público (`SiteFooter`):** línea `© <año> <autor>. …` con enlaces a términos y privacidad; el idioma sigue al selector de la landing (EN/ES) vía `footerContent` en `frontend/src/lib/landingContent.js`.
- **Login y registro:** componente `AuthLegalStrip` con el mismo esquema; el idioma se elige por el idioma del navegador (`es` si `navigator.language` empieza por `es`, si no inglés).
- El nombre del titular se configura con **`VITE_APP_AUTHOR`** (ver `frontend/.env.example`); por defecto **Christian**.
