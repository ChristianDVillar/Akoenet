const path = require("path");
const dotenv = require("dotenv");

/** Carga siempre `backend/.env` aunque el proceso se inicie con cwd distinto (p. ej. raíz del repo). */
const envPath = path.join(__dirname, "..", ".env");
dotenv.config({ path: envPath });

module.exports = { envPath };
