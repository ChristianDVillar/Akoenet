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

## Autoría en el pie de página

El nombre mostrado como “Proyecto y desarrollo por …” se configura con la variable de entorno del frontend `VITE_APP_AUTHOR` (ver `frontend/.env.example`). Si no se define, se usa **Christian** por defecto (coherente con los documentos legales actuales).
