# Checklist de producción (operaciones)

Este proyecto no incluye un despliegue gestionado; antes de tráfico real conviene cerrar estos puntos.

## Seguridad y red

- **HTTPS obligatorio** en el dominio público (terminación TLS en reverse proxy: **Caddy**, **Nginx**, **Traefik**, o balanceador del proveedor).
- **CORS** (`CORS_ORIGINS`) alineado con el origen exacto del frontend en producción.
- **JWT / secretos** rotados y almacenados fuera del repo (gestor de secretos o variables del orquestador).
- **Límite global por IP** (`GLOBAL_RATE_LIMIT_MAX`): capa adicional sobre los límites por ruta (login, subidas, etc.); ajustar según tráfico esperado.

## Datos

- **Backups automáticos de PostgreSQL** (snapshots diarios + retención; prueba de restauración periódica).
- **Política de retención** acorde a `DELETE /auth/me` y requisitos legales (documentado en términos/privacidad).

## Medios y latencia

- **CDN u origen cacheable** para estáticos del frontend y, si aplica, redirecciones firmadas de objetos (`STORAGE_DRIVER=s3`).
- Límites de subida y tipos MIME en backend; además el servidor valida **magic bytes** (`file-type`) para que el contenido coincida con imágenes permitidas (no basta con renombrar un ejecutable).
- Revisar cuotas de storage en el proveedor.

## DMCA / reclamaciones de copyright

- Publica un **correo o formulario de contacto** claramente indicado en la web (p. ej. en la landing o en términos legales) para avisos de retirada.
- Define un proceso interno: quién recibe el aviso, plazos de respuesta y cómo documentas la acción (retirada o contranotificación).

## Voz (WebRTC)

- **Servidor TURN** (coturn u oferta del proveedor) para clientes en redes restrictivas (NAT simétrico, firewalls corporativos). Sin TURN, muchos usuarios solo tendrán audio estable en redes favorables.

## Observabilidad

- Logs estructurados (`pino`) y alertas sobre errores 5xx y caídas de dependencias (`GET /health/deps`).

## Búsqueda a escala

- La **búsqueda global** usa PostgreSQL FTS en canales legibles por usuario. Si el volumen crece mucho, valorar índices adicionales, partición por tiempo o motor dedicado (p. ej. Elastic/OpenSearch) como fase posterior.
