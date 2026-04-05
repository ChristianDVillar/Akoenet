/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("users", {
    steam_id: { type: "text" },
    share_game_activity: { type: "boolean", notNull: true, default: true },
    desktop_game_detect_opt_in: { type: "boolean", notNull: true, default: false },
    manual_activity_game: { type: "text" },
    manual_activity_platform: { type: "text" },
  });
  pgm.sql(`
    CREATE UNIQUE INDEX users_steam_id_unique
    ON users (steam_id)
    WHERE steam_id IS NOT NULL AND deleted_at IS NULL
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS users_steam_id_unique`);
  pgm.dropColumns("users", [
    "steam_id",
    "share_game_activity",
    "desktop_game_detect_opt_in",
    "manual_activity_game",
    "manual_activity_platform",
  ]);
};
