const { authenticator } = require("otplib");

authenticator.options = { window: 1 };

function generateSecret() {
  return authenticator.generateSecret();
}

function verify(secret, token) {
  if (!secret || !token) return false;
  return authenticator.verify({ token: String(token).replace(/\s/g, ""), secret });
}

module.exports = { generateSecret, verify };
