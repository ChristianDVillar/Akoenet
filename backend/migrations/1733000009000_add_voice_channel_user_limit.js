exports.shorthands = undefined;

/** Idempotent: column may already exist (e.g. manual SQL / Supabase) before this migration ran. */
exports.up = (pgm) => {
  pgm.sql("ALTER TABLE channels ADD COLUMN IF NOT EXISTS voice_user_limit integer");
};

exports.down = (pgm) => {
  pgm.sql("ALTER TABLE channels DROP COLUMN IF EXISTS voice_user_limit");
};
