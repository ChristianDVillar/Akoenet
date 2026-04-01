const logger = require("./logger");

const RESEND_API_URL = "https://api.resend.com/emails";

/** Must match a verified sender domain in Resend; aligned with LEGAL_INBOX_EMAIL in lib/legal-mail.js */
const DEFAULT_FROM = "AkoeNet <akonet@streamautomator.com>";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isResendConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

/**
 * @param {{ to: string | string[]; subject: string; html: string; text?: string; replyTo?: string }} opts
 * @returns {Promise<{ ok: boolean; id?: string; error?: string; status?: number }>}
 */
async function sendResendEmail({ to, subject, html, text, replyTo }) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const from = String(process.env.RESEND_FROM || "").trim() || DEFAULT_FROM;
  const recipients = Array.isArray(to) ? to : [to];

  const body = {
    from,
    to: recipients,
    subject,
    html,
  };
  if (text) body.text = text;
  if (replyTo) body.reply_to = replyTo;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const daily = res.headers.get("x-resend-daily-quota");
    const monthly = res.headers.get("x-resend-monthly-quota");
    if (daily != null || monthly != null) {
      logger.debug({ daily, monthly }, "Resend quota headers");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ status: res.status, data }, "Resend API error");
      return { ok: false, error: data?.message || data?.name || `http_${res.status}`, status: res.status };
    }

    return { ok: true, id: data.id };
  } catch (e) {
    logger.warn({ err: e }, "Resend request failed");
    return { ok: false, error: e?.message || "fetch_failed" };
  }
}

/** Shared layout: AkoeNet product mail */
function layoutAkoeNet({ title, innerHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#0f172a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 50%,#6366f1 100%);">
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">AkoeNet</div>
              <div style="font-size:20px;font-weight:700;color:#fff;margin-top:4px;">${escapeHtml(title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:15px;line-height:1.55;color:#cbd5e1;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 20px;border-top:1px solid #334155;font-size:12px;color:#94a3b8;line-height:1.45;">
              ${footerNote || "AkoeNet — community chat and voice. This message was sent by an automated system; do not reply unless a reply address is shown."}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function dpoNotifyDpoHtml({ referenceId, requestType, name, email, subject, message }) {
  const subj = subject ? escapeHtml(subject) : "(no subject)";
  const inner = `
    <p style="margin:0 0 16px;">A new <strong>data protection / privacy</strong> request was submitted through AkoeNet.</p>
    <p style="margin:0 0 8px;"><strong>Reference</strong> #${escapeHtml(String(referenceId))}</p>
    <p style="margin:0 0 8px;"><strong>Type</strong> ${escapeHtml(requestType)}</p>
    <p style="margin:0 0 8px;"><strong>From</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    <p style="margin:0 0 8px;"><strong>Subject</strong> ${subj}</p>
    <div style="margin-top:16px;padding:14px;background:#0f172a;border-radius:8px;border:1px solid #334155;white-space:pre-wrap;">${escapeHtml(message)}</div>
  `;
  return layoutAkoeNet({
    title: `Privacy request #${referenceId}`,
    innerHtml: inner,
    footerNote: "Process this request according to your GDPR / privacy procedures. Reply to the user using their email above.",
  });
}

function dpoUserConfirmationHtml({ referenceId, name }) {
  const inner = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">We received your message to the <strong>AkoeNet</strong> data protection contact.</p>
    <p style="margin:0 0 16px;"><strong>Your reference id:</strong> <span style="color:#a78bfa;font-weight:600;">#${escapeHtml(String(referenceId))}</span></p>
    <p style="margin:0 0 0;">If we need to respond, we will use the email address you provided. Please keep this reference for any follow-up.</p>
  `;
  return layoutAkoeNet({
    title: "Request received",
    innerHtml: inner,
    footerNote: "AkoeNet — you submitted this via the in-app data protection form.",
  });
}

function dmcaNotifyTeamHtml(payload) {
  const {
    referenceId,
    complainant_name,
    complainant_email,
    complainant_phone,
    copyright_holder,
    infringing_url,
    original_work_url,
    description,
    signature,
  } = payload;
  const inner = `
    <p style="margin:0 0 16px;">A <strong>DMCA / copyright</strong> notice was filed via AkoeNet.</p>
    <p style="margin:0 0 8px;"><strong>Reference</strong> #${escapeHtml(String(referenceId))}</p>
    <p style="margin:0 0 8px;"><strong>Complainant</strong> ${escapeHtml(complainant_name)} &lt;${escapeHtml(complainant_email)}&gt;</p>
    ${complainant_phone ? `<p style="margin:0 0 8px;"><strong>Phone</strong> ${escapeHtml(complainant_phone)}</p>` : ""}
    <p style="margin:0 0 8px;"><strong>Copyright holder</strong> ${escapeHtml(copyright_holder)}</p>
    <p style="margin:0 0 8px;"><strong>Infringing URL</strong><br/><a href="${encodeURI(infringing_url)}" style="color:#a78bfa;word-break:break-all;">${escapeHtml(infringing_url)}</a></p>
    ${original_work_url ? `<p style="margin:0 0 8px;"><strong>Original work</strong><br/><a href="${encodeURI(original_work_url)}" style="color:#a78bfa;word-break:break-all;">${escapeHtml(original_work_url)}</a></p>` : ""}
    <p style="margin:0 0 8px;"><strong>Signature</strong> ${escapeHtml(signature)}</p>
    <div style="margin-top:16px;padding:14px;background:#0f172a;border-radius:8px;border:1px solid #334155;white-space:pre-wrap;">${escapeHtml(description)}</div>
  `;
  return layoutAkoeNet({
    title: `DMCA notice #${referenceId}`,
    innerHtml: inner,
    footerNote: "Review in the admin dashboard (DMCA takedowns). Do not ignore valid notices; follow your legal process.",
  });
}

function dmcaComplainantConfirmationHtml({ referenceId, name }) {
  const inner = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">We received your copyright notice for <strong>AkoeNet</strong>.</p>
    <p style="margin:0 0 16px;"><strong>Reference id:</strong> <span style="color:#a78bfa;font-weight:600;">#${escapeHtml(String(referenceId))}</span></p>
    <p style="margin:0 0 0;">We will review it as soon as practicable. Please keep this reference and monitor the email address you provided for updates.</p>
  `;
  return layoutAkoeNet({
    title: "DMCA notice received",
    innerHtml: inner,
    footerNote: "This is an automated acknowledgment only; it does not decide the merits of your claim.",
  });
}

module.exports = {
  escapeHtml,
  isResendConfigured,
  sendResendEmail,
  layoutAkoeNet,
  dpoNotifyDpoHtml,
  dpoUserConfirmationHtml,
  dmcaNotifyTeamHtml,
  dmcaComplainantConfirmationHtml,
};
