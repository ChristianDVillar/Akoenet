const express = require("express");
const { z } = require("zod");
const pool = require("../config/db");
const validate = require("../middleware/validate");
const { legalFormsRateLimiter } = require("../middleware/rate-limit");
const logger = require("../lib/logger");
const {
  isResendConfigured,
  sendResendEmail,
  dpoNotifyDpoHtml,
  dpoUserConfirmationHtml,
} = require("../lib/resend-mail");

const router = express.Router();

function dpoContactFromEnv() {
  return {
    name: process.env.DPO_NAME || "",
    email: process.env.DPO_EMAIL || "",
    phone: process.env.DPO_PHONE || "",
    address: process.env.DPO_ADDRESS || "",
    purpose:
      "Contact for data protection questions, GDPR-related requests, and privacy concerns for this service.",
  };
}

router.get("/contact", (_req, res) => {
  const c = dpoContactFromEnv();
  if (!c.email && !c.name) {
    return res.json({
      ...c,
      note: "DPO contact is not fully configured on this server (set DPO_EMAIL and DPO_NAME in the backend environment).",
    });
  }
  res.json(c);
});

const messageSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(120),
  subject: z.string().trim().max(500).optional().nullable(),
  message: z.string().trim().min(10).max(8000),
  request_type: z
    .enum([
      "general",
      "access",
      "rectification",
      "erasure",
      "portability",
      "objection",
      "restriction",
    ])
    .optional(),
});

router.post("/message", legalFormsRateLimiter, validate({ body: messageSchema }), async (req, res) => {
  try {
    const b = req.body;
    const requestType = b.request_type || "general";
    const subject = b.subject || null;

    const { rows } = await pool.query(
      `INSERT INTO dpo_requests (name, email, subject, message, request_type)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, created_at`,
      [b.name, b.email, subject, b.message, requestType]
    );

    const row = rows[0];
    logger.info(
      { dpo_id: row.id, email: b.email, request_type: requestType },
      "DPO / privacy request received"
    );

    if (isResendConfigured()) {
      const dpo = dpoContactFromEnv();
      const ref = row.id;
      const subLine = subject ? subject : "Privacy / data protection request";
      if (dpo.email) {
        const toDpo = await sendResendEmail({
          to: dpo.email,
          subject: `[AkoeNet DPO #${ref}] ${subLine}`,
          html: dpoNotifyDpoHtml({
            referenceId: ref,
            requestType,
            name: b.name,
            email: b.email,
            subject,
            message: b.message,
          }),
          replyTo: b.email,
        });
        if (!toDpo.ok) {
          logger.warn({ ref, error: toDpo.error }, "DPO notify email to DPO failed");
        }
      } else {
        logger.warn({ ref }, "RESEND_API_KEY set but DPO_EMAIL missing — DPO not notified by mail");
      }
      const toUser = await sendResendEmail({
        to: b.email,
        subject: `[AkoeNet] We received your privacy request (#${ref})`,
        html: dpoUserConfirmationHtml({ referenceId: ref, name: b.name }),
      });
      if (!toUser.ok) {
        logger.warn({ ref, error: toUser.error }, "DPO confirmation email to user failed");
      }
    }

    return res.status(201).json({
      success: true,
      message:
        "Your message was received. If a response is required, we will reply using the contact details you provided.",
      reference_id: row.id,
      created_at: row.created_at,
    });
  } catch (e) {
    logger.error({ err: e }, "DPO request insert failed");
    return res.status(500).json({
      error: "submission_failed",
      message: "Could not save your request. Try again later.",
    });
  }
});

const requestLookupSchema = z.object({
  email: z.string().trim().email().max(120),
});

const requestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.get(
  "/request/:id",
  validate({ query: requestLookupSchema, params: requestIdParamsSchema }),
  async (req, res) => {
    try {
      const id = req.params.id;
      const email = req.query.email.trim().toLowerCase();
      const { rows } = await pool.query(
        `SELECT id, status, subject, request_type, created_at, updated_at, response, responded_at
         FROM dpo_requests
         WHERE id = $1 AND LOWER(TRIM(email)) = $2`,
        [id, email]
      );
      if (!rows.length) {
        return res.status(404).json({ error: "not_found", message: "No request matches that id and email." });
      }
      res.json(rows[0]);
    } catch (e) {
      logger.error({ err: e }, "DPO request lookup failed");
      res.status(500).json({ error: "lookup_failed" });
    }
  }
);

module.exports = router;
