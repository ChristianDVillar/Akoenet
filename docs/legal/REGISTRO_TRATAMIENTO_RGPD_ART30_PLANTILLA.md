# Plantilla — Registro de actividades de tratamiento (Art. 30 RGPD)

**Uso interno.** Completa una fila por actividad de tratamiento. No es una pagina publica del sitio; conserva este documento en un lugar seguro (gestor documental, Notion, etc.).

| ID | Nombre de la actividad | Finalidad | Base legal | Categorias de interesados | Categorias de datos personales | Destinatarios / encargados | Transferencias fuera del EEE | Plazo de supresion / criterios | Medidas de seguridad |
|----|------------------------|-----------|------------|---------------------------|-------------------------------|----------------------------|------------------------------|-------------------------------|----------------------|
| 1 | Cuenta de usuario | Gestion de registro, login, perfil | Ejecucion del contrato; interes legitimo (seguridad) | Usuarios | Identificadores, email, credenciales o OAuth | Hosting (p. ej. Render), BD PostgreSQL | Segun contratos del proveedor (clausulas tipo) | Mientras la cuenta exista + plazo legal | TLS, control de acceso, contrasenas hash |
| 2 | Mensajes y archivos en canales | Prestacion del servicio de chat | Ejecucion del contrato | Usuarios | Contenido, metadatos, IPs si se registran | Mismo + almacenamiento de objetos (S3/local) | Idem | Idem | Idem + backups |
| 3 | Mensajes directos | Comunicacion privada 1:1 | Ejecucion del contrato | Usuarios | Contenido DM, metadatos | Idem | Idem | Idem | Idem |
| 4 | Voz WebRTC | Senalizacion y presencia | Ejecucion del contrato | Usuarios | IDs de sesion, estado de presencia | Servidor de aplicacion | No suele aplicarse a contenido de voz almacenado | En tiempo real; logs minimos | TLS, rate limits |
| 5 | Moderacion y denuncias | Cumplimiento y seguridad | Obligacion legal / interes legitimo | Usuarios, moderadores | Contenido reportado, IDs | Equipo autorizado | — | Segun politica de retencion | Acceso restringido |
| 6 | Formularios DMCA / DPO | Reclamaciones y derechos ARCO | Obligacion legal / consentimiento | Interesados | Datos del formulario | Buzon de correo, BD | — | Plazo legal | Acceso restringido, logs |
| 7 | Logs y metricas operativas | Seguridad, depuracion | Interes legitimo | Usuarios tecnicos | IPs, timestamps | Infraestructura | Segun proveedor | Rotacion / minimizacion | TLS, acceso restringido |

*Adapta filas y responsable (Responsable del tratamiento: nombre/DPO) segun tu despliegue real.*
