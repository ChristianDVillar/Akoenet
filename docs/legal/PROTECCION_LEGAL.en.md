# AkoeNet legal protection

This document defines an operational legal basis to protect AkoeNet software, brand, and content.  
It is not professional legal advice. We recommend validating it with a lawyer in your jurisdiction before publishing in production.

## 1) Ownership and copyright

- All source code, architecture, design, text, logos, trade name, and assets associated with AkoeNet are the property of their owner.
- Copying, distribution, reverse engineering, publication, or commercial exploitation without written authorisation is prohibited.
- Use of the software is granted under a limited, revocable, non-exclusive licence, according to published terms.

Suggested copyright header text:

`Copyright (c) 2026 Dakinys Systems. All rights reserved.`

## 2) Licence of use (draft baseline)

If you do not want third parties to reuse the code, use a proprietary licence and add a restrictive `LICENSE` file.

Minimum recommended clauses:

- Permitted use only to access the official platform.
- Prohibited: resale, sublicensing, or derivative services without permission.
- Prohibited: mass scraping, API abuse, and bypassing security controls.
- Right reserved to suspend accounts for breach.

## 3) Terms of Service (TOS)

Publish a Terms page including at least:

- Identification of the owner and contact methods.
- Conduct rules (spam, harassment, illegal content, impersonation, malware).
- Moderation policy and sanctions.
- Limitation of liability and service availability.
- Applicable law and jurisdiction.

## 4) Privacy policy (GDPR / local law)

Publish a privacy policy including:

- Data collected (account, messages, technical metadata, IP, files).
- Purpose of processing (authentication, service operation, security).
- Legal basis for processing.
- Retention and deletion.
- International transfers (if any).
- User rights (access, rectification, erasure, objection, portability).
- Contact to exercise rights.

## 5) Content policy and user intellectual property

- Users retain rights to their content but grant the licence necessary to host, display, and process it within the service.
- Define a takedown procedure for infringement (notice-and-takedown / DMCA style).
- Reserve the right to remove illegal content or content that violates terms.

## 6) Trade name and brand

To strengthen brand protection:

- Register the AkoeNet name/logo with the trade mark office in your country/region.
- Use the name and brand symbols consistently on web/app.
- Document permitted third-party use of the brand.

## 7) Technical measures supporting legal compliance

- Maintain traceability of changes (commits, releases, dated backups).
- Include copyright notices in:
  - `README.md`
  - headers of key files
  - website/app footer
- Retain access and security logs in line with applicable law.

## 8) Immediate implementation checklist

1. Create and publish `TERMINOS_Y_CONDICIONES.md`.
2. Create and publish `PRIVACIDAD.md`.
3. Define `LICENSE` (proprietary or open, per strategy).
4. Insert legal notice in login/footer of the frontend.
5. Configure legal/privacy email: `legal@your-domain.com`.
6. Prepare abuse and IP infringement reporting process.
7. Consider trade mark registration and, if applicable, software deposit.

## 9) Short template for footer/app

**Spanish**

`© 2026 Dakinys Systems. Todos los derechos reservados. Uso sujeto a Términos y Política de Privacidad.`

**English**

`© 2026 Dakinys Systems. All rights reserved. Use subject to Terms of Service and Privacy Policy.`

In the web client, the public footer uses **Spanish or English** copy depending on the landing language (`footerContent` in `frontend/src/lib/landingContent.js` + `SiteFooter`). The year and owner name may align with `VITE_APP_AUTHOR` and the current year.

## 10) Implementation status in this repository (reference)

| Item | Status |
|------|--------|
| `docs/legal/TERMINOS_Y_CONDICIONES.md` | Published (review placeholders before production) |
| `docs/legal/PRIVACIDAD.md` | Published (review placeholders) |
| Root `LICENSE` | Proprietary “All rights reserved” |
| © notice + links to terms/privacy in footer | `SiteFooter` + strings by language |
| Login / register | Short legal line with links (`AuthLegalStrip`) |
| `legal@…` email | **Operator**: configure on domain and in legal texts; not hard-coded |
| Abuse / DMCA reporting | Forms `/legal/dmca`, `/legal/dpo` + backend; review Resend contact |
| Trade mark registration | **Pending** (external process, not automated in repo) |

### What usually remains outside code

- Legal review of Markdown in your jurisdiction.
- Replace placeholders (`[CONTACTO_…]`, etc.) in `PRIVACIDAD.md` and `TERMINOS_Y_CONDICIONES.md`.
- Operational `legal@…` inbox and internal response process.
- Published retention policy (operational template in **§29** of `docs/ESTRUCTURA_Y_FUNCIONAMIENTO.md`).
