# Política de retención de datos (plantilla operativa)

Documento de trabajo para operadores. **Debe revisarse con asesor legal** antes de publicarse como política definitiva.

## Finalidades

- Prestación del servicio (cuentas, mensajes, medios subidos por usuarios).
- Seguridad, moderación y cumplimiento legal (logs de auditoría, reportes).

## Categorías sugeridas

| Dato | Retención orientativa | Notas |
|------|------------------------|--------|
| Cuenta y perfil | Mientras la cuenta exista | Tras `DELETE /auth/me`, anonimización según implementación y excepciones legales. |
| Mensajes de canal y DM | Mientras el servidor/conversación exista | Los operadores pueden borrar contenido; exportaciones sujetas a `EXPORT_MAX_MESSAGES`. |
| Archivos subidos (imágenes) | Misma vida útil que el mensaje que los referencia | Storage local o S3 según despliegue. |
| Logs de aplicación (pino) | 30–90 días (recomendado) | Rotación en el agregador de logs / disco. |
| `admin_audit_logs` / reportes | 12–24 meses o según obligación | Ajustar por jurisdicción y tipo de incidente. |
| Formularios DMCA / DPO | Plazo razonable para tramitar + archivo legal | Conservar lo mínimo imprescindible para reclamaciones y pruebas. |

## Acciones de usuario

- **Portabilidad:** `GET /auth/me/export` (datos vinculados a la cuenta).
- **Supresión:** `DELETE /auth/me` (anonimización; pueden aplicarse retenciones por seguridad o ley).
- **Solicitudes RGPD:** formulario `/legal/dpo` → `POST /dpo/message`.

## Contacto

Completar con correo y responsable (p. ej. DPO) alineado con `DPO_EMAIL` / `DPO_NAME` en el backend y con `docs/legal/PRIVACIDAD.md`.
