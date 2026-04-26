/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("servers", {
    tag: { type: "varchar(4)", notNull: false },
  });
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS servers_tag_lower_unique
    ON servers (lower(btrim(tag::text)))
    WHERE tag IS NOT NULL AND btrim(tag::text) <> '';
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS servers_tag_lower_unique;");
  pgm.dropColumn("servers", "tag");
};
