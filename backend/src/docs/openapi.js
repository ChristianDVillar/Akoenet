function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "AkoeNet API",
      version: process.env.APP_VERSION || process.env.npm_package_version || "1.4.0",
      description: "Basic OpenAPI spec for key AkoeNet endpoints.",
    },
    servers: [
      {
        url:
          process.env.PUBLIC_API_URL ||
          process.env.RENDER_EXTERNAL_URL ||
          "http://localhost:3000",
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
          summary: "Basic health check",
          responses: {
            200: {
              description: "Backend is up",
            },
          },
        },
      },
      "/messages/channel/{channelId}": {
        get: {
          summary: "Channel message history",
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
            200: { description: "Channel messages" },
            400: { description: "Validation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            403: { description: "No access", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/messages/channel/{channelId}/export": {
        get: {
          summary: "Export channel history as JSON or CSV",
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
      "/messages/{messageId}/context": {
        get: {
          summary: "Message with neighbor rows in the same channel",
          description: "Returns the anchor message plus up to `before` older and `after` newer messages (for jump-to-context UIs).",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "messageId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "before",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0, maximum: 50, default: 10 },
            },
            {
              name: "after",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 0, maximum: 50, default: 10 },
            },
          ],
          responses: {
            200: { description: "Ordered messages including anchor" },
            403: { description: "No access to channel" },
            404: { description: "Message not found" },
          },
        },
      },
      "/messages/{messageId}/reactions": {
        get: {
          summary: "List aggregated reactions for a message",
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
            200: { description: "Aggregated reactions" },
            403: { description: "No access" },
            404: { description: "Message not found" },
          },
        },
        post: {
          summary: "Add reaction to a message",
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
          summary: "Remove reaction from a message",
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
            200: { description: "Reaction removed" },
            403: { description: "No access" },
            404: { description: "Message not found" },
            429: { description: "Rate limited" },
          },
        },
      },
      "/admin/overview": {
        get: {
          summary: "Admin dashboard KPIs and activity aggregates (admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Aggregates from DB (users, messages, reports, etc.)" },
            403: { description: "Admin only" },
            500: { description: "Query failed" },
          },
        },
      },
      "/admin/audit-logs": {
        get: {
          summary: "List moderation audit logs (admin)",
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
            200: { description: "Paginated audit log" },
            403: { description: "Admin only" },
          },
        },
      },
      "/upload/channel/{channelId}": {
        post: {
          summary: "Upload image to channel",
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
            200: { description: "Upload successful" },
            400: { description: "Validation or mime error" },
            403: { description: "No access" },
            429: { description: "Rate limited" },
          },
        },
      },
      "/upload/direct/{conversationId}": {
        post: {
          summary: "Upload image to direct conversation",
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
            200: { description: "Upload successful" },
            400: { description: "Validation or mime error" },
            403: { description: "No access" },
            429: { description: "Rate limited" },
          },
        },
      },
      "/integrations/scheduler/discovery": {
        get: {
          summary: "Streamer Scheduler integration metadata (proxies GET /api/integration/akoenet)",
          responses: {
            200: { description: "Discovery JSON from remote Scheduler" },
            502: { description: "Scheduler unreachable or invalid" },
            503: { description: "SCHEDULER_API_BASE_URL not set" },
          },
        },
      },
      "/integrations/scheduler/servers": {
        get: {
          summary: "List AkoeNet servers for Scheduler channel picker (shared secret, same as stream-scheduled webhook)",
          parameters: [
            {
              name: "x-scheduler-webhook-secret",
              in: "header",
              required: true,
              schema: { type: "string" },
              description: "Must match SCHEDULER_WEBHOOK_SECRET",
            },
          ],
          responses: {
            200: {
              description: "servers: { id, name }[] (string ids). Excludes system servers.",
            },
            401: { description: "Missing or wrong secret" },
          },
        },
      },
      "/integrations/scheduler/servers/{serverId}/channels": {
        get: {
          summary: "List text channels in a server (for announcement target)",
          parameters: [
            {
              name: "x-scheduler-webhook-secret",
              in: "header",
              required: true,
              schema: { type: "string" },
              description: "Must match SCHEDULER_WEBHOOK_SECRET",
            },
            {
              name: "serverId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            200: {
              description: "channels: { id, name }[] (string ids). Text channels only.",
            },
            401: { description: "Missing or wrong secret" },
            404: { description: "Server not found" },
          },
        },
      },
      "/integrations/scheduler/upcoming": {
        get: {
          summary: "Upcoming streams from Streamer Scheduler (proxy)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "username",
              in: "query",
              required: false,
              description:
                "Twitch login or Scheduler slug. If a user linked Twitch and set scheduler_streamer_username in profile, Twitch login is mapped to that slug before calling the Scheduler API.",
              schema: { type: "string", minLength: 1, maxLength: 80 },
            },
            {
              name: "mode",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["all", "next"], default: "all" },
            },
          ],
          responses: {
            200: {
              description:
                "Events and formatted text. If SCHEDULER_API_BASE_URL is unset, scheduler_configured is false and events/formatted are empty.",
            },
            400: { description: "No username (link Twitch or configure default)" },
            401: { description: "No token" },
            502: { description: "Scheduler unreachable or bad response" },
          },
        },
      },
    },
  };
}

module.exports = { buildOpenApiSpec };
