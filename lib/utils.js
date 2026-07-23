const { customAlphabet } = require("nanoid");
const config = require("../config");

const nanoidAlpha = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);
const nanoidSession = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 32);

function generateUsername() {
  const prefixes = ["user", "mail", "temp", "anon", "dev", "test", "inbox", "hello", "info", "me"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  return prefix + nanoidAlpha(6);
}

function generateSessionId() {
  return nanoidSession();
}

function getRandomDomain(domains) {
  return domains[Math.floor(Math.random() * domains.length)];
}

function generateAddress(username, domain) {
  return `${username}@${domain}`;
}

function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function sanitizeHTML(html) {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function calcSpamScore(emailData) {
  let score = 0;
  const subject = (emailData.subject || "").toLowerCase();
  const body = (emailData.text || emailData.html || "").toLowerCase();
  const spamKeywords = ["win", "winner", "prize", "free money", "click here", "urgent", "limited offer", "act now", "casino", "lottery"];
  spamKeywords.forEach(kw => {
    if (subject.includes(kw) || body.includes(kw)) score += 10;
  });
  if (!emailData.from || !emailData.from.address) score += 30;
  return Math.min(score, 100);
}

function successResponse(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function errorResponse(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

module.exports = {
  generateUsername,
  generateSessionId,
  getRandomDomain,
  generateAddress,
  getClientIP,
  sanitizeHTML,
  calcSpamScore,
  successResponse,
  errorResponse
};
//