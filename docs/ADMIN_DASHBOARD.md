# Panel de administración (Admin dashboard)

Documentación del comportamiento del **Admin dashboard** de AkoeNet: quién puede acceder, qué muestra la interfaz y qué endpoints del backend utiliza.

## Ubicación y acceso

| Aspecto | Comportamiento |
|--------|----------------|
| **Ruta SPA** | `/admin` (`frontend/src/pages/DashboardAdmin.jsx`). |
| **Protección frontend** | `AdminRoute` en `App.jsx`: sesión obligatoria y `user.is_admin === true`. Si no hay usuario → redirección a `/login`. Si el usuario no es admin → redirección a `/`. |
| **Protección API** | Rutas bajo `/admin/*` (excepto la coincidencia con middleware global) usan `auth` + `requireAdmin` en el backend (`app.js`). Sin JWT válido o sin flag admin en el token → **403**. |
| **Navegación** | Desde el dashboard principal o la vista de servidor puede haber enlaces que navegan a `/admin` (p. ej. usuarios admin). |

## Flujo de carga

Al montar la página y cuando cambian ciertos filtros, se ejecuta **`load()`**, que en paralelo solicita:

1. `GET /health` — comprobación básica de que la API responde (`ok`, producto).
2. `GET /admin/health/deps` — informe de dependencias (acepta respuesta aunque sea error HTTP; `validateStatus: () => true`).
3. `GET /admin/audit-logs?…` — listado paginado de auditoría con filtros actuales.
4. `GET /admin/reports/messages?…` — listado paginado de reportes de mensajes con filtros actuades.
5. `GET /admin/metrics` — métricas en memoria del proceso (si responde 200 se muestran; si no, se ocultan).

Si **`load()`** falla de forma global (excepción en el `Promise.all`), se muestra el mensaje: *Could not load system diagnostics*.

**Reintentos:** botón **Retry** vuelve a llamar a `load()`.

**Historial de comprobaciones:** cada ejecución exitosa de `load` registra en estado local (máximo **10** entradas) la hora ISO, si el informe de dependencias fue `ok` y la latencia total `total_latency_ms` del último `deps` recibido.

## Dependencias y salud (`/admin/health/deps`)

El informe coincide con `buildDepsReport` en el backend. La UI muestra:

- **Meta:** versión de la app, uptime del proceso, latencia total del chequeo.
- **Filas por dependencia:**
  - **API** — latencia interna del chequeo.
  - **Database** — `SELECT 1` (OK / ERROR + ms).
  - **Redis** — si no está configurado muestra *NO CONFIG*; si está, ping (OK / ERROR + ms).
  - **Storage** — driver (p. ej. `local`, `s3`) y estado del almacenamiento.
  - **Streamer Scheduler API** — si `SCHEDULER_API_BASE_URL` no está definido → *NOT SET* (se considera “no aplicable” y el badge puede verse bien). Si está configurado, se comprueba el discovery remoto; puede mostrar versión/servicio y texto *legacy API* si aplica. Si el backend devuelve `hint`, se muestra debajo de la rejilla.

Los badges usan verde/rojo según `ok` de cada bloque.

## Métricas (`GET /admin/metrics`)

Fuente: contadores **en memoria** del proceso Node (`lib/runtime-metrics.js`):

- Mensajes de canal y DM **totales** desde el arranque del proceso.
- Mensajes en la **ventana móvil ~60 s** (canal / DM).
- Uptime del proceso (se indica que **se reinicia al desplegar**).

No son métricas persistentes ni multi-instancia: con varias réplicas, cada proceso tiene sus propios contadores.

## Auditoría de moderación (`GET /admin/audit-logs`)

Lista filas de `admin_audit_logs` con el actor (join a `users`).

**Filtros (query):**

| Parámetro | Uso en UI |
|-----------|-----------|
| `limit` | Fijo en **20** en el cliente (paginación). |
| `offset` | Paginación Previous / Next. |
| `action` | Texto libre (p. ej. `message_pin`). |
| `server_id` | ID numérico de servidor. |
| `from` / `to` | `datetime-local` → se envían como ISO al API. |

**Apply** resetea `offset` a 0 y vuelve a cargar. **Clear** vacía filtros y `offset`.

Cada fila muestra hora local, `action` y `actor_username` (o `user:id`).

**Paginación:** muestra rango “Showing X–Y of total” y botones Previous/Next según `total` y `offset`.

## Reportes de mensajes (`GET /admin/reports/messages`)

Solo entradas cuya acción es `message_report_user` o `dm_message_report_user` en auditoría.

**Filtros:**

| Parámetro | UI |
|-----------|-----|
| `status` | Select: **open**, **resolved**, **rejected**, **all**. Al cambiar estado o servidor se resetea `offset` a 0. |
| `server_id` | Opcional. |
| `limit` | **20**; `offset` con Previous/Next. |

Cada ítem muestra: hora, tipo (DM vs canal), id de auditoría, id del mensaje, reporter, y estado derivado de `metadata.status` (open / resolved / rejected).

**Acciones por fila:**

- **Resolve** → `PATCH /admin/reports/messages/:auditId` con `status: 'resolved'`.
- **Reject** → mismo endpoint con `status: 'rejected'`.
- **Reopen** → `status: 'open'`.

Antes de enviar el PATCH, el navegador abre un **`window.prompt`** para una **nota opcional del moderador**. El backend guarda en `metadata`: `status`, `moderator_note`, `reviewed_at`, `reviewed_by` (id del admin autenticado).

Si el PATCH falla, se muestra: *Could not update report status*.

**Refresh** en el formulario de filtros vuelve a ejecutar `load()`.

## Enlaces auxiliares

- **API Docs:** enlace absoluto a `{baseURL}/docs` (Swagger UI), en nueva pestaña.
- **Back:** vuelve al home vía `<Link to="/">`.

## Resumen de endpoints

| Método | Ruta | Rol |
|--------|------|-----|
| `GET` | `/health` | Público (salud simple). |
| `GET` | `/admin/health/deps` | Admin — dependencias. |
| `GET` | `/admin/metrics` | Admin — contadores en memoria. |
| `GET` | `/admin/audit-logs` | Admin — auditoría paginada/filtrada. |
| `GET` | `/admin/reports/messages` | Admin — reportes paginados/filtrados. |
| `PATCH` | `/admin/reports/messages/:auditId` | Admin — actualizar estado del reporte. |

## Panel unificado en Streamer Scheduler (opcional)

El monorepo **Streamer Scheduler** puede mostrar las mismas rutas `/admin/*` de AkoeNet vía proxy HTTP (`GET`/`PATCH` … hacia este backend), usando en el servidor Scheduler las variables `AKOENET_API_URL` y `AKOENET_ADMIN_BEARER` (JWT de un **admin de AkoeNet**, no el de Scheduler). Detalle y pruebas de humo: `streamer-scheduler/docs/ADMIN_DASHBOARD.md` (sección *Pruebas de humo*).

## Limitaciones conocidas

- La UI del admin **no edita** logs de auditoría ni borra reportes; solo lista y actualiza el **estado** del reporte vía metadata.
- Las métricas de mensajes son **por proceso** y se pierden al reiniciar el servidor.
- El listado de reportes muestra datos enriquecidos desde mensajes/DM; si un mensaje fue eliminado, parte del contenido puede no mostrarse según la consulta SQL.
