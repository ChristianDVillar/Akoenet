const pool = require("../config/db");

async function areUsersBlocked(userIdA, userIdB) {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;
  const r = await pool.query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userIdA, userIdB]
  );
  return r.rows.length > 0;
}

module.exports = { areUsersBlocked };
