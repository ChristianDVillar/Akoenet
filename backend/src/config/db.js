const { Pool } = require("pg");

require("../load-env");

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.PGUSER || "postgres"}:${
    process.env.PGPASSWORD || "1234"
  }@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${
    process.env.PGDATABASE || "akonet"
  }`;

function poolOptions() {
  const opts = { connectionString };
  const cs = String(connectionString || "");
  const sslMode = /sslmode=([^&]+)/i.exec(cs);
  const mode = sslMode ? String(sslMode[1]).toLowerCase() : "";
  // Pooler Supabase + Node: sslmode=require en la URL hace que pg use verificación estricta y a menudo
  // falla con SELF_SIGNED_CERT_IN_CHAIN; usa sslmode=no-verify en DATABASE_URL o PGSSL_REJECT_UNAUTHORIZED=false.
  const hostLooksRemote =
    /\.supabase\.co/i.test(cs) ||
    /amazonaws\.com/i.test(cs) ||
    mode === "require" ||
    mode === "verify-full" ||
    mode === "verify-ca" ||
    String(process.env.PGSSLMODE || "").toLowerCase() === "require";

  if (hostLooksRemote) {
    opts.ssl =
      String(process.env.PGSSL_REJECT_UNAUTHORIZED || "true").toLowerCase() === "false"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };
  }

  return opts;
}

const pool = new Pool(poolOptions());

module.exports = pool;
