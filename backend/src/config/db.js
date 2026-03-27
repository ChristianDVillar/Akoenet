const { Pool } = require("pg");
require("dotenv").config();

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.PGUSER || "postgres"}:${
    process.env.PGPASSWORD || "1234"
  }@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${
    process.env.PGDATABASE || "akonet"
  }`;

const pool = new Pool({
  connectionString,
});

module.exports = pool;
