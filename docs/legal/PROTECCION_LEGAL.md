# Protección legal de AkoeNet

Este documento define una base legal operativa para proteger el software, la marca y el contenido de AkoeNet.  
No constituye asesoría legal profesional. Se recomienda validarlo con un abogado de tu jurisdicción antes de publicarlo en producción.

## 1) Titularidad y derechos de autor

- Todo el código fuente, arquitectura, diseño, textos, logos, nombre comercial y activos asociados a AkoeNet son propiedad de su titular.
- Se prohíbe la copia, distribución, ingeniería inversa, publicación o explotación comercial sin autorización escrita.
- El uso del software se concede bajo licencia limitada, revocable y no exclusiva, según los términos que se publiquen.

Texto sugerido para encabezado de derechos:

`Copyright (c) 2026 Dakinys Systems. Todos los derechos reservados.`

## 2) Licencia de uso (propuesta base)

Si no deseas que terceros reutilicen el código, usa una licencia propietaria y agrega un archivo `LICENSE` con texto restrictivo.

Cláusulas mínimas recomendadas:

- Uso permitido solo para acceso a la plataforma oficial.
- Prohibido revender, sublicenciar o crear servicios derivados sin permiso.
- Prohibido scraping masivo, abuso de API y bypass de controles de seguridad.
- Reserva del derecho de suspender cuentas por incumplimiento.

## 3) Términos y condiciones (TOS)

Publicar una página de Términos con, al menos:

- Identificación del titular y medios de contacto.
- Reglas de conducta (spam, acoso, contenido ilegal, suplantación, malware).
- Política de moderación y sanciones.
- Limitación de responsabilidad y disponibilidad del servicio.
- Ley aplicable y jurisdicción.

## 4) Política de privacidad (RGPD/LOPD u otras normas aplicables)

Publicar una política de privacidad con:

- Datos recolectados (cuenta, mensajes, metadatos técnicos, IP, archivos).
- Finalidad del tratamiento (autenticación, operación del servicio, seguridad).
- Base legal del tratamiento.
- Retención y borrado.
- Transferencias internacionales (si aplican).
- Derechos del usuario (acceso, rectificación, supresión, oposición, portabilidad).
- Contacto para ejercer derechos.

## 5) Política de contenido y propiedad intelectual de usuarios

- El usuario conserva derechos sobre su contenido, pero otorga licencia necesaria para alojar, mostrar y procesar el contenido dentro del servicio.
- Definir procedimiento de retirada por infracción (estilo notice-and-takedown / DMCA).
- Reservar derecho de eliminar contenido ilegal o que viole términos.

## 6) Marca y nombre comercial

Para reforzar protección de marca:

- Registrar nombre/logo de AkoeNet ante la oficina de marcas de tu país/región.
- Usar consistentemente la denominación y símbolos de marca en web/app.
- Documentar uso permitido de la marca por terceros.

## 7) Medidas técnicas de respaldo legal

- Mantener trazabilidad de cambios (commits, releases, backups fechados).
- Incluir avisos de copyright en:
  - `README.md`
  - encabezados de archivos clave
  - pie de página de web/app
- Conservar logs de acceso y seguridad conforme a normativa aplicable.

## 8) Checklist de implementación inmediata

1. Crear y publicar `TERMINOS_Y_CONDICIONES.md`.
2. Crear y publicar `PRIVACIDAD.md`.
3. Definir `LICENSE` (propietaria o abierta, según estrategia).
4. Insertar aviso legal en login/footer del frontend.
5. Configurar email legal/datos: `legal@tu-dominio.com`.
6. Preparar proceso de reporte de abusos e infracciones IP.
7. Evaluar registro de marca y, si aplica, depósito de software.

## 9) Plantilla corta para footer/app

**Español**

`© 2026 Dakinys Systems. Todos los derechos reservados. Uso sujeto a Términos y Política de Privacidad.`

**English**

`© 2026 Dakinys Systems. All rights reserved. Use subject to Terms of Service and Privacy Policy.`

En el cliente web, el pie público usa textos en **español o inglés** según el idioma de la landing (`footerContent` en `frontend/src/lib/landingContent.js` + `SiteFooter`). El año y el nombre del titular pueden alinearse con `VITE_APP_AUTHOR` y el año en curso.

## 10) Estado de implementación en este repositorio (referencia)

| Punto | Estado |
|-------|--------|
| `docs/legal/TERMINOS_Y_CONDICIONES.md` | Publicado (revisar placeholders antes de producción) |
| `docs/legal/PRIVACIDAD.md` | Publicado (revisar placeholders) |
| `LICENSE` en la raíz | Propietaria «All rights reserved» |
| Aviso © + enlaces a términos/privacidad en pie | `SiteFooter` + strings por idioma |
| Login / registro | Aviso legal breve con enlaces (`AuthLegalStrip`) |
| Email `legal@…` | **Operador**: configurar en dominio y en textos legales; no fijado en código |
| Reporte de abusos / DMCA | Formularios `/legal/dmca`, `/legal/dpo` + backend; revisar contacto Resend |
| Registro de marca | **Pendiente** (trámite externo, no automatizable en repo) |

### Qué suele faltar fuera del código

- Validación jurídica de los Markdown en tu jurisdicción.
- Sustituir placeholders (`[CONTACTO_…]`, etc.) en `PRIVACIDAD.md` y `TERMINOS_Y_CONDICIONES.md`.
- Buzón operativo `legal@…` y proceso interno de respuesta.
- Política de retención publicada (plantilla operativa en **§29** de `docs/ESTRUCTURA_Y_FUNCIONAMIENTO.md`).
