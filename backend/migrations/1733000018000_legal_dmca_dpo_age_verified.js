/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn(
    "users",
    {
      age_verified_at: { type: "timestamptz" },
    },
    { ifNotExists: true }
  );

  pgm.addColumn(
    "messages",
    {
      dmca_removed_at: { type: "timestamptz" },
    },
    { ifNotExists: true }
  );

  pgm.addColumn(
    "direct_messages",
    {
      dmca_removed_at: { type: "timestamptz" },
    },
    { ifNotExists: true }
  );

  pgm.createTable("dmca_takedowns", {
    id: "id",
    complainant_name: { type: "text", notNull: true },
    complainant_email: { type: "text", notNull: true },
    complainant_phone: { type: "text" },
    copyright_holder: { type: "text", notNull: true },
    infringing_url: { type: "text", notNull: true },
    original_work_url: { type: "text" },
    description: { type: "text", notNull: true },
    good_faith_statement: { type: "boolean", notNull: true },
    accuracy_statement: { type: "boolean", notNull: true },
    signature: { type: "text", notNull: true },
    status: { type: "varchar(20)", notNull: true, default: "pending" },
    resolution_notes: { type: "text" },
    resolved_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    resolved_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createIndex("dmca_takedowns", "status", { name: "idx_dmca_takedowns_status" });
  pgm.createIndex("dmca_takedowns", "created_at", { name: "idx_dmca_takedowns_created_at" });

  pgm.createTable("dpo_requests", {
    id: "id",
    name: { type: "varchar(255)", notNull: true },
    email: { type: "varchar(255)", notNull: true },
    subject: { type: "varchar(500)" },
    message: { type: "text", notNull: true },
    request_type: { type: "varchar(50)", notNull: true, default: "general" },
    status: { type: "varchar(20)", notNull: true, default: "pending" },
    response: { type: "text" },
    responded_by: { type: "integer", references: "users", onDelete: "SET NULL" },
    responded_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createIndex("dpo_requests", "email", { name: "idx_dpo_requests_email" });
  pgm.createIndex("dpo_requests", "status", { name: "idx_dpo_requests_status" });

  pgm.sql(`
    CREATE OR REPLACE FUNCTION users_enforce_min_age()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.birth_date IS NOT NULL THEN
        IF NEW.birth_date > (CURRENT_DATE - INTERVAL '13 years') THEN
          RAISE EXCEPTION 'User must be at least 13 years old (birth_date)'
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_users_min_age ON users;
    CREATE TRIGGER trg_users_min_age
      BEFORE INSERT OR UPDATE OF birth_date ON users
      FOR EACH ROW
      EXECUTE PROCEDURE users_enforce_min_age();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_users_min_age ON users;
    DROP FUNCTION IF EXISTS users_enforce_min_age();
  `);

  pgm.dropTable("dpo_requests", { ifExists: true });
  pgm.dropTable("dmca_takedowns", { ifExists: true });

  pgm.dropColumns("direct_messages", ["dmca_removed_at"], { ifExists: true });
  pgm.dropColumns("messages", ["dmca_removed_at"], { ifExists: true });
  pgm.dropColumns("users", ["age_verified_at"], { ifExists: true });
};
