"use strict";

/**
 * Atribución de derechos de autor del servidor API AkoeNet.
 * Dakinys Systems como titular documentado en código y trazas de arranque.
 */
const SOFTWARE_COPYRIGHT_HOLDER = "Dakinys Systems";

function getCopyrightDisplayYear() {
  return new Date().getFullYear();
}

/**
 * Aviso de copyright del API AkoeNet (paridad con Streamer Scheduler `dakinisCopyrightNotice`).
 */
function dakinisCopyrightNotice() {
  return `Copyright © ${getCopyrightDisplayYear()} ${SOFTWARE_COPYRIGHT_HOLDER}. AkoeNet API server — all rights reserved.`;
}

module.exports = {
  SOFTWARE_COPYRIGHT_HOLDER,
  dakinisCopyrightNotice,
};
