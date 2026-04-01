# Checklist de producción (operaciones)

Este proyecto no incluye un despliegue gestionado; antes de tráfico real conviene cerrar estos puntos.

## Seguridad y red

- **HTTPS obligatorio** en el dominio público (terminación TLS en reverse proxy: **Caddy**, **Nginx**, **Traefik**, o balanceador del proveedor).
- Tras el proxy, **activa `TRUST_PROXY=1`** en el backend para que `X-Forwarded-Proto` sea reconocido. El backend puede **redirigir HTTP→HTTPS** en producción (`NODE_ENV=production`) salvo que pongas `FORCE_HTTPS=false` (útil en pruebas locales).
- **CORS** (`CORS_ORIGINS`) alineado con el origen exacto del frontend en producción.
- **JWT / secretos** rotados y almacenados fuera del repo (gestor de secretos o variables del orquestador).
- **Límite global por IP** (`GLOBAL_RATE_LIMIT_MAX`): capa adicional sobre los límites por ruta (login, subidas, etc.). Si no defines la variable, el backend usa **200 req/min en producción** y **400 en desarrollo**; ajusta según tráfico esperado.

### Caddy (ejemplo)

Archivo de referencia en el repo: `deploy/Caddyfile.example` (TLS automático, API + Socket.IO + SPA).

Puntos a revisar al copiarlo:

- Sustituir `example.com` por tu dominio.
- La directiva `@api` debe incluir las rutas que sirve Express: `/auth`, `/api` (alias OAuth), `/servers`, `/channels`, `/messages`, `/upload`, **`/uploads`** (descargas y redirects S3), `/dm`, `/integrations`, `/admin`, `/health`, `/docs`, `/dpo`, `/dmca`.
- `handle /socket.io/*` debe proxy al mismo backend que el API.
- Tras desplegar, comprobar: `curl -sI http://tudominio/` → `301` a `https://` y cabecera `strict-transport-security` (el backend también puede enviar HSTS si `TRUST_PROXY=1`).

### Nginx (ejemplo mínimo)

Sustituye `api.example.com` y `www.example.com` según tu esquema (API y frontend pueden ser el mismo host con paths distintos, como en el Caddy de ejemplo).

```nginx
# Redirección HTTP → HTTPS
server {
  listen 80;
  server_name api.example.com www.example.com;
  return 301 https://$host$request_uri;
}

# API + WebSocket + estáticos (ajusta root al build de Vite)
server {
  listen 443 ssl http2;
  server_name api.example.com www.example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options "nosniff" always;

  # Backend Node (misma máquina o red Docker)
  location ~ ^/(auth|api|servers|channels|messages|upload|uploads|dm|integrations|admin|health|docs|dpo|dmca)(/|$) {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location / {
    root /var/www/akoenet;
    try_files $uri $uri/ /index.html;
  }
}
```

En el backend: `TRUST_PROXY=1`, `NODE_ENV=production`, `CORS_ORIGINS=https://www.example.com` (u origen exacto del SPA).

## Datos

- **Backups automáticos de PostgreSQL** (snapshots diarios + retención; prueba de restauración periódica).
  - Scripts: `scripts/backup-db.sh`, `scripts/backup-uploads.sh` (uploads con `STORAGE_DRIVER=local`).
  - **Entrada única para cron:** `scripts/backup-all.sh` (ejecuta ambos).
  - Variables: `DATABASE_URL`, `BACKUP_DIR` (default `/var/backups/akoenet`), `BACKUP_RETENTION_DAYS` (default 30), opcional `S3_BACKUP_BUCKET` + credenciales AWS para copiar el `.sql.gz` a S3.
- **Estado de copias en el servidor:** si configuras `BACKUP_DIR` con los `.sql.gz` generados por el cron, `GET /admin/backup-status` (JWT admin) lista el último archivo y avisa si hace más de 48 h.
- **Política de retención:** plantilla operativa en `docs/RETENCION_DATOS.md`; alinear con `docs/legal/PRIVACIDAD.md` y variables DPO/DMCA en producción.

### Restauración (PostgreSQL)

1. Detener el backend o poner mantenimiento para evitar escrituras durante el restore.
2. Crear una base vacía o limpiar la destino (solo en entornos de prueba).
3. Descomprimir y aplicar el volcado:

```bash
gunzip -c /var/backups/akoenet/akonet_db_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"
```

4. Verificar migraciones (`pgmigrations`) y levantar el servicio.
5. **Probar al menos una vez al mes** en staging con un backup real (objetivo RTO/RPO acordado con el negocio).

### Restauración (uploads locales)

```bash
tar -xzf /var/backups/akoenet/akonet_uploads_YYYYMMDD_HHMMSS.tar.gz -C /ruta/padre --strip-components=0
# Asegúrate de que UPLOADS_PATH / backend/uploads coincide con el despliegue.
```

Con `STORAGE_DRIVER=s3`, la fuente de verdad es el bucket; planifica versionado o snapshots en el proveedor de objetos.

## Medios y latencia

- **CDN u origen cacheable** para estáticos del frontend y, si aplica, redirecciones firmadas de objetos (`STORAGE_DRIVER=s3`).
- Límites de subida y tipos MIME en backend; el servidor valida **magic bytes** (`file-type` en `upload.routes.js`) para que el contenido coincida con imágenes permitidas (no basta con renombrar un ejecutable).
- Revisar cuotas de storage en el proveedor.

## DMCA / reclamaciones de copyright

- Publica un **correo o formulario de contacto** claramente indicado en la web (p. ej. en la landing o en términos legales) para avisos de retirada.
- En esta aplicación: formulario público **/legal/dmca** → `POST /dmca/takedown`; listado y resolución en **admin** (`GET /admin/dmca-takedowns`, `PATCH /admin/dmca-takedowns/:id`). Opcional: marcar `remove_infringing_message: true` al resolver para intentar retirar un mensaje cuyo id se pueda inferir de la URL notificada.
- **Correo (Resend):** con `RESEND_API_KEY` y remitente por defecto `AkoeNet <akonet@streamautomator.com>` (`RESEND_FROM` opcional), el backend envía avisos al DPO y acuse al usuario en **DPO** (el correo del DPO, si no configuras `DPO_EMAIL`, es el buzón legal `LEGAL_INBOX_EMAIL`, por defecto `akonet@streamautomator.com`); en **DMCA** el equipo siempre recibe copia en ese buzón legal y se añaden `DMCA_NOTIFY_EMAIL` / `ADMIN_NOTIFY_EMAIL` / `DPO_EMAIL` si están definidos; acuse al reclamante. Sin clave, el flujo HTTP sigue igual y solo se registra en logs/BD.
- Define un proceso interno: quién recibe el aviso, plazos de respuesta y cómo documentas la acción (retirada o contranotificación).

## Voz (WebRTC)

- **Servidor TURN** (coturn u oferta del proveedor) para clientes en redes restrictivas (NAT simétrico, firewalls corporativos). Sin TURN, muchos usuarios solo tendrán audio estable en redes favorables.

## Observabilidad

- Logs estructurados (`pino`) y alertas sobre errores 5xx y caídas de dependencias (`GET /health/deps`).

## Búsqueda a escala

- La **búsqueda global** usa PostgreSQL FTS en canales legibles por usuario. Si el volumen crece mucho, valorar índices adicionales, partición por tiempo o motor dedicado (p. ej. Elastic/OpenSearch) como fase posterior.
