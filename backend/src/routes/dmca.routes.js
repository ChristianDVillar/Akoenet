const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const validate = require("../middleware/validate");
const { legalFormsRateLimiter } = require("../middleware/rate-limit");
const logger = require("../lib/logger");
const {
  isResendConfigured,
  sendResendEmail,
  dmcaNotifyTeamHtml,
  dmcaComplainantConfirmationHtml,
} = require("../lib/resend-mail");

const router = express.Router();

function dmcaNotifyRecipients() {
  const raw =
    process.env.DMCA_NOTIFY_EMAIL ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    process.env.DPO_EMAIL ||
    "";
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const emptyToNull = (v) => (v === "" || v == null ? null : v);

const takedownSchema = z.object({
  complainant_name: z.string().trim().min(2).max(200),
  complainant_email: z.string().trim().email().max(120),
  complainant_phone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable().optional()),
  copyright_holder: z.string().trim().min(2).max(300),
  infringing_url: z.string().trim().url().max(2000),
  original_work_url: z.preprocess(
    emptyToNull,
    z.union([z.string().trim().url().max(2000), z.null()]).optional()
  ),
  description: z.string().trim().min(20).max(8000),
  good_faith_statement: z.literal(true),
  accuracy_statement: z.literal(true),
  signature: z.string().trim().min(2).max(200),
});

router.post("/takedown", legalFormsRateLimiter, validate({ body: takedownSchema }), async (req, res) => {
  try {
    const b = req.body;
    const phone = b.complainant_phone || null;
    const orig = b.original_work_url || null;

    const { rows } = await pool.query(
      `INSERT INTO dmca_takedowns (
        complainant_name, complainant_email, complainant_phone,
        copyright_holder, infringing_url, original_work_url,
        description, good_faith_statement, accuracy_statement, signature
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id, created_at`,
      [
        b.complainant_name,
        b.complainant_email,
        phone,
        b.copyright_holder,
        b.infringing_url,
        orig,
        b.description,
        true,
        true,
        b.signature,
      ]
    );

    const row = rows[0];
    logger.info(
      { dmca_id: row.id, email: b.complainant_email, url: b.infringing_url },
      "DMCA takedown request received"
    );

    if (isResendConfigured()) {
      const ref = row.id;
      const team = dmcaNotifyRecipients();
      if (team.length) {
        const teamRes = await sendResendEmail({
          to: team,
          subject: `[AkoeNet DMCA #${ref}] New copyright notice`,
          html: dmcaNotifyTeamHtml({
            referenceId: ref,
            complainant_name: b.complainant_name,
            complainant_email: b.complainant_email,
            complainant_phone: phone,
            copyright_holder: b.copyright_holder,
            infringing_url: b.infringing_url,
            original_work_url: orig,
            description: b.description,
            signature: b.signature,
          }),
          replyTo: b.complainant_email,
        });
        if (!teamRes.ok) {
          logger.warn({ ref, error: teamRes.error }, "DMCA team notify email failed");
        }
      } else {
        logger.warn(
          { ref },
          "RESEND_API_KEY set but no DMCA_NOTIFY_EMAIL / ADMIN_NOTIFY_EMAIL / DPO_EMAIL — team not notified by mail"
        );
      }
      const userRes = await sendResendEmail({
        to: b.complainant_email,
        subject: `[AkoeNet] DMCA notice received (#${ref})`,
        html: dmcaComplainantConfirmationHtml({ referenceId: ref, name: b.complainant_name }),
      });
      if (!userRes.ok) {
        logger.warn({ ref, error: userRes.error }, "DMCA complainant confirmation email failed");
      }
    }

    return res.status(202).json({
      success: true,
      message:
        "Your DMCA notice was received. We will review it as soon as practicable. Keep your reference id for follow-up.",
      reference_id: row.id,
      created_at: row.created_at,
    });
  } catch (e) {
    logger.error({ err: e }, "DMCA takedown insert failed");
    return res.status(500).json({
      error: "submission_failed",
      message: "Could not save your request. Try again later or contact support.",
    });
  }
});

module.exports = router;
