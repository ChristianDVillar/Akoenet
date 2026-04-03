const fs = require("fs");
const path = require("path");
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

const REGISTRATION_LOGO_CID = "akonet-logo";

/** Public absolute URL for the logo when inline file is unavailable (production HTTPS). */
function resolveMailLogoUrl() {
  const explicit = String(process.env.EMAIL_LOGO_URL || "").trim();
  if (explicit) return explicit;
  const fe = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${fe}/Akoenet.png`;
}

/**
 * Reads Akoenet.png for CID embedding so remote mail servers do not fetch localhost URLs.
 * @returns {{ filename: string; content: string; content_id: string; content_type: string } | null}
 */
function tryReadRegistrationLogoInline() {
  const candidates = [];
  const envPath = String(process.env.MAIL_LOGO_PATH || "").trim();
  if (envPath) candidates.push(envPath);
  candidates.push(path.join(__dirname, "../../..", "frontend", "public", "Akoenet.png"));
  const seen = new Set();
  for (const p of candidates) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    try {
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      return {
        filename: "Akoenet.png",
        content: buf.toString("base64"),
        content_id: REGISTRATION_LOGO_CID,
        content_type: "image/png",
      };
    } catch (e) {
      logger.warn({ err: e, p }, "Could not read mail logo file");
    }
  }
  return null;
}

/**
 * @param {{ title: string; innerHtml: string; footerNote?: string; logoSrc?: string }} opts
 */
function layoutAkoeNet({ title, innerHtml, footerNote, logoSrc }) {
  const hasLogo = logoSrc != null && String(logoSrc).trim();
  const logoSrcSafe = hasLogo ? escapeHtml(String(logoSrc).trim()) : "";
  const headerBlock = hasLogo
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
  <tr>
    <td style="vertical-align:middle;text-align:left;padding:0 8px 0 0;">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">AkoeNet</div>
      <div style="font-size:20px;font-weight:700;color:#fff;margin-top:6px;line-height:1.25;">${escapeHtml(title)}</div>
    </td>
    <td style="vertical-align:middle;text-align:right;width:200px;min-width:160px;padding:0;">
      <img src="${logoSrcSafe}" alt="AkoeNet" width="200" style="display:block;border:0;outline:none;text-decoration:none;width:200px;max-width:200px;height:auto;margin-left:auto;" />
    </td>
  </tr>
</table>`
    : `<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">AkoeNet</div>
              <div style="font-size:20px;font-weight:700;color:#fff;margin-top:4px;">${escapeHtml(title)}</div>`;
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
            <td style="padding:22px 24px;background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 50%,#6366f1 100%);">
              ${headerBlock}
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

/**
 * @param {{ to: string | string[]; subject: string; html: string; text?: string; replyTo?: string; attachments?: unknown[] }} opts
 * @returns {Promise<{ ok: boolean; id?: string; error?: string; status?: number }>}
 */
async function sendResendEmail({ to, subject, html, text, replyTo, attachments }) {
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
  if (attachments && attachments.length) body.attachments = attachments;

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

function registrationVerifyHtml({ verifyUrl, logoSrc }) {
  const inner = `
    <p style="margin:0 0 16px;">You asked to create an <strong>AkoeNet</strong> account.</p>
    <p style="margin:0 0 16px;">Open the link below to choose your username and password. It expires in 24 hours.</p>
    <p style="margin:0 0 16px;">
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Complete registration</a>
    </p>
    <p style="margin:0;font-size:13px;color:#94a3b8;word-break:break-all;">${escapeHtml(verifyUrl)}</p>
  `;
  return layoutAkoeNet({
    title: "Confirm your email",
    innerHtml: inner,
    footerNote: "If you did not request this, you can ignore this message.",
    logoSrc,
  });
}

/**
 * @param {{ to: string; verifyUrl: string }} opts
 * @returns {Promise<{ ok: boolean; id?: string; error?: string; status?: number }>}
 */
async function sendRegistrationVerificationEmail({ to, verifyUrl }) {
  const inline = tryReadRegistrationLogoInline();
  const logoSrc = inline ? `cid:${inline.content_id}` : resolveMailLogoUrl();
  if (!inline) {
    logger.warn(
      "Registration email: logo file not found; using URL (localhost will not show in most clients). Set MAIL_LOGO_PATH or deploy with frontend/public/Akoenet.png next to the API."
    );
  }
  const html = registrationVerifyHtml({ verifyUrl, logoSrc });
  const attachments = inline
    ? [
        {
          filename: inline.filename,
          content: inline.content,
          content_id: inline.content_id,
          content_type: inline.content_type,
        },
      ]
    : undefined;
  return sendResendEmail({
    to,
    subject: "Complete your AkoeNet registration",
    html,
    text: `Complete your AkoeNet registration (expires in 24h): ${verifyUrl}`,
    attachments,
  });
}

module.exports = {
  escapeHtml,
  isResendConfigured,
  resolveMailLogoUrl,
  tryReadRegistrationLogoInline,
  sendResendEmail,
  layoutAkoeNet,
  dpoNotifyDpoHtml,
  dpoUserConfirmationHtml,
  dmcaNotifyTeamHtml,
  dmcaComplainantConfirmationHtml,
  registrationVerifyHtml,
  sendRegistrationVerificationEmail,
};
