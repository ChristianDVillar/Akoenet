exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER FUNCTION public.users_enforce_min_age()
    SET search_path = pg_catalog;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER FUNCTION public.users_enforce_min_age()
    RESET search_path;
  `);
};
