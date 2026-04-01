/**
 * Single inbox for legal / sensitive operator notifications (DMCA, DPO team copy).
 * Default matches Resend "from" domain; override with LEGAL_INBOX_EMAIL if needed.
 */
const DEFAULT_LEGAL_INBOX = "akonet@streamautomator.com";

function getLegalInboxEmail() {
  return String(process.env.LEGAL_INBOX_EMAIL || DEFAULT_LEGAL_INBOX).trim();
}

function parseEmailList(...chunks) {
  const out = [];
  for (const c of chunks) {
    const s = String(c || "").trim();
    if (!s) continue;
    for (const part of s.split(",")) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/**
 * DMCA team recipients: always includes the legal inbox, plus optional extra addresses
 * from DMCA_NOTIFY_EMAIL, ADMIN_NOTIFY_EMAIL, and DPO_EMAIL (each comma-separated).
 */
function getDmcaNotifyRecipients() {
  const inbox = getLegalInboxEmail();
  const raw = parseEmailList(
    process.env.DMCA_NOTIFY_EMAIL,
    process.env.ADMIN_NOTIFY_EMAIL,
    process.env.DPO_EMAIL
  );
  const set = new Set([inbox, ...raw]);
  return [...set];
}

module.exports = {
  DEFAULT_LEGAL_INBOX,
  getLegalInboxEmail,
  getDmcaNotifyRecipients,
};
