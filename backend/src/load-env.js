const path = require("path");
const dotenv = require("dotenv");

/** Carga siempre `backend/.env` aunque el proceso se inicie con cwd distinto (p. ej. raíz del repo). */
const envPath = path.join(__dirname, "..", ".env");

/** En Docker/Render estas variables vienen del orquestador; no deben ser sustituidas por un .env local. */
const HOST_ENV_KEYS = ["JWT_SECRET", "DATABASE_URL", "NODE_ENV"];
const hostSnapshot = {};
for (const k of HOST_ENV_KEYS) {
  if (Object.prototype.hasOwnProperty.call(process.env, k)) {
    hostSnapshot[k] = process.env[k];
  }
}

dotenv.config({ path: envPath, override: false });
for (const [k, v] of Object.entries(hostSnapshot)) {
  process.env[k] = v;
}

module.exports = { envPath };
