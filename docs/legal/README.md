# Documentación legal (AkoeNet)

Índice de los textos legales del proyecto. Los Markdown viven en **`docs/legal/`** y el **cliente web** los muestra en rutas públicas (`/legal/...`).

## Archivos

Las páginas públicas del cliente usan **español e inglés**: para cada texto principal existe un fichero `*.en.md` (inglés) junto al `*.md` (español). El idioma mostrado sigue al selector de la landing (`LandingLocaleProvider`) y en `/legal/:slug` hay conmutador **English / Español**.

| Documento | Español | English |
|-----------|---------|---------|
| Política de privacidad | [`PRIVACIDAD.md`](./PRIVACIDAD.md) | [`PRIVACIDAD.en.md`](./PRIVACIDAD.en.md) |
| Términos y condiciones | [`TERMINOS_Y_CONDICIONES.md`](./TERMINOS_Y_CONDICIONES.md) | [`TERMINOS_Y_CONDICIONES.en.md`](./TERMINOS_Y_CONDICIONES.en.md) |
| Protección legal | [`PROTECCION_LEGAL.md`](./PROTECCION_LEGAL.md) | [`PROTECCION_LEGAL.en.md`](./PROTECCION_LEGAL.en.md) |
| Política de cookies | [`POLITICA_COOKIES.md`](./POLITICA_COOKIES.md) | [`POLITICA_COOKIES.en.md`](./POLITICA_COOKIES.en.md) |
| Moderación de contenidos (DSA) | [`MODERACION_CONTENIDOS.md`](./MODERACION_CONTENIDOS.md) | [`MODERACION_CONTENIDOS.en.md`](./MODERACION_CONTENIDOS.en.md) |
| Eliminación de cuenta | [`ACCOUNT_DELETION.md`](./ACCOUNT_DELETION.md) | [`ACCOUNT_DELETION.en.md`](./ACCOUNT_DELETION.en.md) |
| Estándares de seguridad infantil | [`CHILD_SAFETY.md`](./CHILD_SAFETY.md) | [`CHILD_SAFETY.en.md`](./CHILD_SAFETY.en.md) |
| Plantilla interna — registro (Art. 30 RGPD) | [`REGISTRO_TRATAMIENTO_RGPD_ART30_PLANTILLA.md`](./REGISTRO_TRATAMIENTO_RGPD_ART30_PLANTILLA.md) | — |
| Plantilla interna — EIPD / DPIA | [`DPIA_PLANTILLA_RGPD.md`](./DPIA_PLANTILLA_RGPD.md) | — |

## En la aplicación web

Tras compilar o ejecutar el frontend de Vite:

- `/legal/privacidad` — política de privacidad  
- `/legal/terminos` — términos y condiciones  
- `/legal/proteccion` — protección legal  
- `/legal/cookies` — política de cookies y almacenamiento local  
- `/legal/moderacion` — declaración de moderación de contenidos (DSA)  
- `/legal/account-deletion` — información sobre borrado de cuenta y solicitudes  
- `/legal/child-safety` — estándares de seguridad infantil (CSAE / CSAM)  

La **landing pública** y el **pie de página** enlazan a estas rutas. El **contacto legal / DSA** (correo) se muestra en el pie si defines `VITE_LEGAL_CONTACT_EMAIL` en el build (ver `frontend/.env.example`).

Las plantillas **Art. 30** y **DPIA** son documentos internos (no tienen ruta pública en la app); complétalos fuera del repositorio o enlázalos solo si decides publicarlos.

## Antes de producción

Sustituye los placeholders de contacto (`[CONTACTO_LEGAL]`, `[CONTACTO_PRIVACIDAD]`, etc.) en los Markdown y revisa el texto con asesoría jurídica si el servicio es público.

## Copyright y aviso corto en el cliente

- **Pie público (`SiteFooter`):** línea `© <año> <autor>. …` con enlaces a términos y privacidad; el idioma sigue al selector de la landing (EN/ES) vía `footerContent` en `frontend/src/lib/landingContent.js`.
- **Login y registro:** componente `AuthLegalStrip` con el mismo esquema; el idioma se elige por el idioma del navegador (`es` si `navigator.language` empieza por `es`, si no inglés).
- El nombre del titular se configura con **`VITE_APP_AUTHOR`** (ver `frontend/.env.example`); por defecto **Christian**.
