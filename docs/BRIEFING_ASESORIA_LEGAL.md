# Briefing para asesoría jurídica — AkoeNet

**Documento interno.** Reúne el contexto necesario para que un abogado especializado en protección de datos, servicios digitales y/o propiedad intelectual evalúe el cumplimiento normativo y revise los textos legales del proyecto. **No sustituye** el asesoramiento profesional.

**Versión:** 2026-04-06  
**Producto:** AkoeNet — plataforma de comunicación en tiempo real (servidores, canales, mensajes directos, voz WebRTC, integración opcional con Twitch/Steam, aplicación web y cliente de escritorio Windows vía Tauri).

---

## 1. Responsable y contacto (completar antes de enviar)

| Campo | Valor / notas |
|-------|----------------|
| Denominación / titular del tratamiento | *Ej.: nombre o razón social del responsable* |
| Domicilio / país de establecimiento principal | En los borradores legales del repositorio figura **España** y tribunales de **Madrid** en términos (revisar si aplica). |
| Correo legal operativo | Sustituir placeholders `[CONTACTO_LEGAL]` en `docs/legal/TERMINOS_Y_CONDICIONES.md` |
| Correo privacidad / ejercicio de derechos | Sustituir `[CONTACTO_PRIVACIDAD]` en `docs/legal/PRIVACIDAD.md` |
| Contacto DSA / autoridades (pie web) | Variable de build `VITE_LEGAL_CONTACT_EMAIL` (ver `frontend/.env.example`) — buzón dedicado a notificaciones legales y DSA, no soporte general. |
| Delegado de Protección de Datos (DPO) | Configurable en backend (`DPO_*`) y página pública `/legal/dpo` — **valorar obligación de nombramiento** con el letrado. |

---

## 2. Qué es AkoeNet (resumen funcional)

- **Cuentas:** registro con email (verificación en dos pasos), inicio de sesión, **OAuth Twitch** opcional, enlace opcional **Steam** para presencia de juego.
- **Edad:** registro email/contraseña exige fecha de nacimiento y **mínimo 13 años** (validación en backend).
- **Contenido generado por usuarios:** mensajes en canales, DMs, archivos/imágenes adjuntos, reacciones, edición y borrado según permisos; **moderación** por servidores (roles, bans, reportes).
- **Voz y vídeo:** WebRTC con señalización por Socket.IO; posible necesidad de **TURN** en redes restrictivas (configuración `VITE_ICE_SERVERS`).
- **Derechos del interesado (implementados en producto):** exportación de datos (`GET /auth/me/export`), borrado de cuenta (`DELETE /auth/me`), formularios **DMCA** (`/legal/dmca`) y **DPO / RGPD** (`/legal/dpo`) con backend y, si está configurado, correo vía **Resend**.
- **Cliente:** SPA (React/Vite), despliegue público de referencia en **Render** (frontend estático + API Node separada); **app de escritorio** Windows (Tauri) con actualizador opcional.

---

## 3. Tratamiento de datos — categorías y ubicaciones

| Categoría | Ejemplos | Dónde / notas |
|-----------|----------|----------------|
| Identificación y cuenta | Usuario, email, OAuth (Twitch), Steam ID si se enlaza | Base PostgreSQL; JWT + refresh token en BD |
| Contenido | Mensajes, DMs, imágenes subidas | BD + almacenamiento local o **S3** según `STORAGE_DRIVER` |
| Conexión y seguridad | IP, logs de acceso, rate limiting | Servidor Node, logs estructurados |
| Preferencias | Tema, ajustes de voz (parte en `localStorage` del navegador) | Cliente; política de cookies describe claves principales |
| Notificaciones push | Suscripciones web push si el usuario activa | Tabla `push_subscriptions` (si aplica en el despliegue) |

**Transferencias internacionales:** dependen del proveedor de hosting/BD (p. ej. **Render** fuera del EEE o con subprocesadores). Debe alinearse la información de la política de privacidad y, si procede, SCC o decisión de adecuación.

**Documentación técnica ampliada:** `docs/ESTRUCTURA_Y_FUNCIONAMIENTO.md` (arquitectura, rutas API, sockets).

---

## 4. Textos legales publicados en la aplicación

Los Markdown viven en **`docs/legal/`** (español + inglés `*.en.md`). Rutas web típicas:

| Ruta SPA | Contenido |
|----------|-----------|
| `/legal/terminos` | Términos y condiciones |
| `/legal/privacidad` | Política de privacidad |
| `/legal/proteccion` | Aviso / protección legal (marca, copyright) |
| `/legal/cookies` | Política de cookies y almacenamiento local |
| `/legal/moderacion` | Declaración de moderación (enfoque DSA) |
| `/legal/dmca` | Formulario DMCA (HTTP `POST /dmca/takedown`) |
| `/legal/dpo` | Contacto y solicitudes RGPD (HTTP `POST /dpo/message`, `GET /dpo/contact`) |

**Banner de cookies:** consentimiento con opciones Aceptar / Rechazar no esenciales / Configurar; clave `akoenet_cookie_consent_v2` en `localStorage`. Descripción en `docs/legal/POLITICA_COOKIES.md`.

**Checklist operativa general:** `docs/PRODUCCION.md` (HTTPS, CORS, backups, TURN, etc.).

---

## 5. Cumplimiento normativo — estado y temas a validar con el abogado

Lo siguiente es un **inventario de trabajo**, no una conclusión jurídica:

| Ámbito | Qué existe en el proyecto | Pregunta típica para asesoría |
|--------|---------------------------|-------------------------------|
| **RGPD / LOPDGDD** | Política de privacidad, derechos (export/borrado), DPO form, plantilla Art. 30 y DPIA en `docs/legal/` | ¿Obligatoriedad de DPO o representante en la UE? ¿Adecuación de bases legales y retenciones? ¿Contrato encargo tratamiento con proveedores? |
| **DSA** | Declaración de moderación, reportes, formulario DMCA, contacto legal vía env | ¿Umbral de obligaciones DSA según tipo de servicio y tamaño? ¿Procedimientos de transparencia / informes anuales? |
| **ePrivacy / LSSI** | Política de cookies, banner con rechazo, clasificación técnico vs opcional | ¿Texto y registro del consentimiento suficientes? ¿Cookies de terceros futuras (analítica)? |
| **Propiedad intelectual** | Términos, DMCA, licencia del repo `LICENSE` | ¿Procedimiento notice-and-takedown conforme a normativa aplicable? ¿Marca “AkoeNet”? |
| **Menores** | Mínimo 13 años en registro email | ¿Exigencias adicionales (p. ej. edad digital, parentalidad) según mercado objetivo? |
| **Voz / datos sensibles** | Contenido de voz en tiempo real, no almacenamiento masivo de grabaciones por defecto | ¿Consideración de categorías especiales si el usuario revela datos en audio? |

---

## 6. Documentos internos (no públicos en la app)

- `docs/legal/REGISTRO_TRATAMIENTO_RGPD_ART30_PLANTILLA.md` — plantilla de registro de actividades (Art. 30 RGPD).
- `docs/legal/DPIA_PLANTILLA_RGPD.md` — plantilla de evaluación de impacto (EIPD/DPIA).
- `docs/RETENCION_DATOS.md` — referencia de retención (si existe en el repo; revisar).

Deben **completarse** y archivarse según indique el asesor.

---

## 7. Riesgos y lagunas conocidas (técnicas / operativas)

- Placeholders **`[CONTACTO_LEGAL]`** y **`[CONTACTO_PRIVACIDAD]`** siguen en los Markdown hasta sustituirlos por datos reales.
- El **instalador Windows** puede generar avisos de SmartScreen (firma de código no comercial); mencionado en FAQ pública — valorar implicaciones de distribución.
- **Representante en la UE** si el responsable no tiene establecimiento en el EEE y ofrece servicios a residentes en la UE: **decisión de negocio + legal**.
- **Condiciones de terceros** (Twitch, Steam, proveedores de correo): enlazar o resumir en privacidad si procede.

---

## 8. Preguntas sugeridas para la reunión con el abogado

1. ¿Los textos de `docs/legal/*.md` (ES/EN) son **suficientes** para publicación o qué cláusulas faltan/riesgos principales?  
2. ¿Hay **obligación** de nombrar DPO, representante en la UE o ambos en nuestro escenario concreto?  
3. ¿El **banner de cookies** y la política cumplen LSSI/ePrivacy para el uso actual y para posible analítica futura?  
4. ¿Qué obligaciones **DSA** aplican a este tipo de plataforma y qué documentación o procesos internos faltan?  
5. ¿Recomendación sobre **cláusulas de jurisdicción** (Madrid) y ley aplicable para usuarios fuera de España?  
6. ¿Procedimiento **DMCA / retirada de contenidos** alineado con práctica defendible en caso de conflicto?  
7. ¿Necesidad de **EIPD/DPIA** formal y cuándo presentarla a la AEPD?  
8. ¿Contratos tipo con **encargados del tratamiento** (hosting, email, BD)?  

---

## 9. Material a adjuntar al enviar este briefing

- Este fichero (`docs/BRIEFING_ASESORIA_LEGAL.md`).
- Carpeta o export de **`docs/legal/`** (versiones ES y EN de políticas y términos).
- Opcional: extracto de **`docs/PRODUCCION.md`** si el despliegue es el evaluado.
- Lista de **dominios y URLs** reales de producción (frontend y API).
- Descripción del **volumen de usuarios** previsto o actual (anonimizada) para valorar umbrales DSA/RGPD.

---

## 10. Contacto del proyecto para seguimiento

*Completar: nombre, email, teléfono del responsable del producto o del interlocutor técnico.*

---

*Documento generado para facilitar la primera toma de contacto con asesoría jurídica. Actualizar la fecha y los datos del apartado 1 y 10 en cada envío.*
