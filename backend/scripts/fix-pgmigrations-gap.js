/**
 * Repara public.pgmigrations (orden run_on / filas faltantes) para node-pg-migrate checkOrder.
 *
 * Uso:
 *   npm run migrate:fix-order
 *   npm run migrate:fix-order:reseed   → TRUNCATE + 9 filas (esquema ya aplicado)
 */
const { Client } = require("pg");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MISSING = "1733000001000_add_admin_user_and_flag";

const insertMissing = `
INSERT INTO public.pgmigrations (name, run_on)
SELECT $1::varchar,
  COALESCE(
    (SELECT run_on + interval '1 microsecond' FROM public.pgmigrations WHERE name = '1733000000000_init_akonet_schema' LIMIT 1),
    (SELECT run_on - interval '1 microsecond' FROM public.pgmigrations WHERE name = '1733000002000_add_server_invites' LIMIT 1),
    NOW()
  )
WHERE NOT EXISTS (SELECT 1 FROM public.pgmigrations WHERE name = $1);
`;

const fix1000After2000 = `
UPDATE public.pgmigrations AS p
SET run_on = r2.run_on - interval '1 microsecond'
FROM public.pgmigrations AS r2
WHERE p.name = $1
  AND r2.name = '1733000002000_add_server_invites'
  AND p.run_on >= r2.run_on;
`;

/** Fija run_on de las 9 migraciones AkoeNet a una secuencia estricta (sin tocar tablas de datos). */
const normalizeOrderSql = `
UPDATE public.pgmigrations AS p
SET run_on = v.ts
FROM (
  VALUES
    ('1733000000000_init_akonet_schema'::varchar, TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 1 * interval '1 millisecond'),
    ('1733000001000_add_admin_user_and_flag', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 2 * interval '1 millisecond'),
    ('1733000002000_add_server_invites', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 3 * interval '1 millisecond'),
    ('1733000003000_add_server_emojis', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 4 * interval '1 millisecond'),
    ('1733000004000_add_message_pinning', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 5 * interval '1 millisecond'),
    ('1733000005000_add_message_reactions_and_audit_logs', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 6 * interval '1 millisecond'),
    ('1733000006000_add_user_profile_settings', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 7 * interval '1 millisecond'),
    ('1733000007000_add_user_presence_status', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 8 * interval '1 millisecond'),
    ('1733000008000_add_private_channels', TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + 9 * interval '1 millisecond')
) AS v(name, ts)
WHERE p.name = v.name;
`;

const names = [
  "1733000000000_init_akonet_schema",
  "1733000001000_add_admin_user_and_flag",
  "1733000002000_add_server_invites",
  "1733000003000_add_server_emojis",
  "1733000004000_add_message_pinning",
  "1733000005000_add_message_reactions_and_audit_logs",
  "1733000006000_add_user_profile_settings",
  "1733000007000_add_user_presence_status",
  "1733000008000_add_private_channels",
];

const reseedAll = `
TRUNCATE public.pgmigrations;
INSERT INTO public.pgmigrations (name, run_on)
SELECT n, TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + (ord * interval '1 millisecond')
FROM unnest($1::text[]) WITH ORDINALITY AS t(n, ord);
`;

function orderMatchesDb(rows) {
  if (rows.length !== names.length) return false;
  for (let i = 0; i < names.length; i += 1) {
    if (rows[i].name !== names[i]) return false;
  }
  return true;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    if (process.argv.includes("--reseed")) {
      console.log("TRUNCATE pgmigrations + 9 filas ordenadas (solo historial de migraciones).");
      await client.query(reseedAll, [names]);
      console.log("Listo. Ejecuta: npm run migrate");
      return;
    }

    const ins = await client.query(insertMissing, [MISSING]);
    if (ins.rowCount > 0) {
      console.log("Listo: se insertó la fila faltante para", MISSING);
    }

    const fixTs = await client.query(fix1000After2000, [MISSING]);
    if (fixTs.rowCount > 0) {
      console.log("Listo: se corrigió run_on de", MISSING, "(quedaba después de 2000).");
    }

    const { rows: ordered } = await client.query(
      "SELECT name FROM public.pgmigrations ORDER BY run_on, id"
    );

    if (orderMatchesDb(ordered)) {
      console.log("pgmigrations: orden correcto. Ejecuta: npm run migrate");
      return;
    }

    const haveSet = new Set(ordered.map((r) => r.name));
    const missingList = names.filter((n) => !haveSet.has(n));
    if (missingList.length > 0) {
      console.error("Faltan filas en pgmigrations:", missingList.join(", "));
      console.error("Orden actual (run_on):", ordered.map((r) => r.name).join(" → "));
      console.error("\nSi el esquema en DB ya está completo: npm run migrate:fix-order:reseed");
      process.exit(1);
    }

    console.log("Alineando run_on de las 9 migraciones al orden de archivos…");
    const norm = await client.query(normalizeOrderSql);
    console.log("Listo: filas actualizadas:", norm.rowCount, "→ npm run migrate");

    const { rows: check } = await client.query(
      "SELECT name FROM public.pgmigrations ORDER BY run_on, id"
    );
    if (!orderMatchesDb(check)) {
      console.error("Sigue sin coincidir el orden. Prueba: npm run migrate:fix-order:reseed");
      console.error("Orden actual:", check.map((r) => r.name).join(" → "));
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
