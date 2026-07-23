const connectDB = require("../../lib/mongodb");
const Inbox = require("../../lib/models/Inbox");
const Email = require("../../lib/models/Email");
const Log = require("../../lib/models/Log");
const config = require("../../config");
const {
  generateUsername,
  generateSessionId,
  getRandomDomain,
  generateAddress,
  getClientIP,
  successResponse,
  errorResponse
} = require("../../lib/utils");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  await connectDB();

  if (req.method === "POST") {
    return createInbox(req, res);
  }
  if (req.method === "GET") {
    return getInbox(req, res);
  }
  return errorResponse(res, "Method not allowed", 405);
};

async function createInbox(req, res) {
  try {
    const ip = getClientIP(req);
    const { username, domain, sessionId: existingSession } = req.body || {};

    const activeDomains = config.domains;
    const chosenDomain = activeDomains.includes(domain) ? domain : getRandomDomain(activeDomains);
    const chosenUsername = (username && /^[a-z0-9._-]{3,30}$/.test(username))
      ? username.toLowerCase()
      : generateUsername();

    const address = generateAddress(chosenUsername, chosenDomain);
    const sessionId = existingSession || generateSessionId();

    const existing = await Inbox.findOne({ address });
    if (existing) {
      const emails = await Email.find({ inboxId: existing._id, deleted: false })
        .select("-html -text -attachments -headers")
        .sort({ receivedAt: -1 })
        .limit(50);
      return successResponse(res, { inbox: existing, emails, sessionId: existing.sessionId });
    }

    const ipCount = await Inbox.countDocuments({ ip, active: true });
    if (ipCount >= config.inbox.maxInboxPerIP) {
      return errorResponse(res, "Too many inboxes from this IP", 429);
    }

    const expiresAt = new Date(Date.now() + config.inbox.expirationHours * 60 * 60 * 1000);

    const inbox = await Inbox.create({
      address,
      username: chosenUsername,
      domain: chosenDomain,
      sessionId,
      ip,
      expiresAt
    });

    await Log.create({ type: "inbox", action: "created", ip, target: address });

    return successResponse(res, { inbox, emails: [], sessionId }, 201);
  } catch (err) {
    console.error("Create inbox error:", err);
    return errorResponse(res, "Failed to create inbox", 500);
  }
}

async function getInbox(req, res) {
  try {
    const { address, sessionId } = req.query;
    if (!address) return errorResponse(res, "Address required");

    const inbox = await Inbox.findOne({ address: address.toLowerCase(), active: true });
    if (!inbox) return errorResponse(res, "Inbox not found", 404);

    const emails = await Email.find({ inboxId: inbox._id, deleted: false })
      .select("-attachments -headers")
      .sort({ receivedAt: -1 })
      .limit(100);

    return successResponse(res, { inbox, emails });
  } catch (err) {
    console.error("Get inbox error:", err);
    return errorResponse(res, "Failed to get inbox", 500);
  }
}
