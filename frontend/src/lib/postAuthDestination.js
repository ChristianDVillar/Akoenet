/** Home route after sign-in / register / OAuth. Admins land on the system dashboard. */
export function postAuthDestination(user) {
  return user?.is_admin === true ? '/admin' : '/'
}
