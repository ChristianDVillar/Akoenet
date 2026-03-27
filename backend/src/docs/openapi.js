function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "AkoNet API",
      version: process.env.APP_VERSION || process.env.npm_package_version || "1.0.0",
      description: "OpenAPI spec basica para endpoints clave de AkoNet.",
    },
    servers: [
      {
        url: process.env.PUBLIC_API_URL || "http://localhost:3000",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
          required: ["error"],
        },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "Health basico",
          responses: {
            200: {
              description: "Backend activo",
            },
          },
        },
      },
      "/messages/channel/{channelId}": {
        get: {
          summary: "Historial de mensajes de canal",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "channelId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: "before",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            200: { description: "Mensajes del canal" },
            400: { description: "Validation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            403: { description: "No access", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/messages/channel/{channelId}/export": {
        get: {
          summary: "Exportar historial de canal en JSON/CSV",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "channelId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "format",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["json", "csv"], default: "json" },
            },
          ],
          responses: {
            200: { description: "Export exitoso" },
            403: { description: "No access" },
            413: { description: "Export demasiado grande" },
          },
        },
      },
      "/messages/{messageId}/reactions": {
        get: {
          summary: "Listar reacciones agregadas de un mensaje",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "messageId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            200: { description: "Reacciones agregadas" },
            403: { description: "No access" },
            404: { description: "Message not found" },
          },
        },
        post: {
          summary: "Agregar reaccion a un mensaje",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "messageId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reaction_key: { type: "string", minLength: 1, maxLength: 32 },
                  },
                  required: ["reaction_key"],
                },
              },
            },
          },
          responses: {
            200: { description: "Reaccion agregada" },
            403: { description: "No access" },
            404: { description: "Message not found" },
            429: { description: "Rate limited" },
          },
        },
        delete: {
          summary: "Quitar reaccion de un mensaje",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "messageId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reaction_key: { type: "string", minLength: 1, maxLength: 32 },
                  },
                  required: ["reaction_key"],
                },
              },
            },
          },
          responses: {
            200: { description: "Reaccion removida" },
            403: { description: "No access" },
            404: { description: "Message not found" },
            429: { description: "Rate limited" },
          },
        },
      },
      "/admin/audit-logs": {
        get: {
          summary: "Listar logs de auditoria de moderacion (admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
            },
            {
              name: "offset",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0, default: 0 },
            },
            {
              name: "server_id",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "action",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "from",
              in: "query",
              required: false,
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "to",
              in: "query",
              required: false,
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: {
            200: { description: "Lista paginada de auditoria" },
            403: { description: "Admin only" },
          },
        },
      },
      "/upload/channel/{channelId}": {
        post: {
          summary: "Subir imagen para canal",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "channelId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            200: { description: "Upload exitoso" },
            400: { description: "Validation or mime error" },
            403: { description: "No access" },
            429: { description: "Rate limited" },
          },
        },
      },
      "/upload/direct/{conversationId}": {
        post: {
          summary: "Subir imagen para conversacion directa",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "conversationId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            200: { description: "Upload exitoso" },
            400: { description: "Validation or mime error" },
            403: { description: "No access" },
            429: { description: "Rate limited" },
          },
        },
      },
    },
  };
}

module.exports = { buildOpenApiSpec };
