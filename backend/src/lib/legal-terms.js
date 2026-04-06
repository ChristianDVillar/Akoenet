/**
 * Published Terms of Service / Privacy bundle version. Bump when legal text changes materially
 * and users must re-accept (set LEGAL_TERMS_VERSION in backend .env).
 */
function getCurrentTermsVersion() {
  const v = String(process.env.LEGAL_TERMS_VERSION || "1").trim();
  return v.length > 0 && v.length <= 32 ? v : "1";
}

function userNeedsTermsAcceptance(userRow) {
  if (!userRow) return true;
  const cur = getCurrentTermsVersion();
  if (!userRow.terms_accepted_at) return true;
  return String(userRow.terms_version || "") !== cur;
}

/**
 * @param {object} userRow — row from users (must include terms_version, terms_accepted_at if present)
 * @param {object} sanitized — output of sanitizeUserMediaFields or similar
 */
function mergeTermsFieldsIntoUserPayload(userRow, sanitized) {
  const cur = getCurrentTermsVersion();
  return {
    ...sanitized,
    terms_version: userRow.terms_version ?? null,
    terms_accepted_at: userRow.terms_accepted_at || null,
    current_terms_version: cur,
    needs_terms_acceptance: userNeedsTermsAcceptance(userRow),
  };
}

module.exports = {
  getCurrentTermsVersion,
  userNeedsTermsAcceptance,
  mergeTermsFieldsIntoUserPayload,
};
