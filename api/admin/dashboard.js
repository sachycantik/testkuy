const connectDB = require("../../lib/mongodb");
const Email = require("../../lib/models/Email");
const Inbox = require("../../lib/models/Inbox");
const Log = require("../../lib/models/Log");
const config = require("../../config");
const { successResponse, errorResponse } = require("../../lib/utils");
//
function checkAuth(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return false;
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  const [user, pass] = decoded.split(":");
  return user === config.admin.username && pass === config.admin.password;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!checkAuth(req)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="NOXXY Admin"');
    return res.status(401).json({ error: "Unauthorized" });
  }

  await connectDB();

  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalInboxes,
      activeInboxes,
      totalEmails,
      emailsToday,
      emailsWeek,
      recentLogs,
      topDomains
    ] = await Promise.all([
      Inbox.countDocuments(),
      Inbox.countDocuments({ active: true }),
      Email.countDocuments({ deleted: false }),
      Email.countDocuments({ receivedAt: { $gte: oneDayAgo }, deleted: false }),
      Email.countDocuments({ receivedAt: { $gte: oneWeekAgo }, deleted: false }),
      Log.find().sort({ createdAt: -1 }).limit(50),
      Inbox.aggregate([
        { $group: { _id: "$domain", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    return successResponse(res, {
      stats: {
        totalInboxes,
        activeInboxes,
        totalEmails,
        emailsToday,
        emailsWeek
      },
      topDomains,
      recentLogs
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    return errorResponse(res, "Internal error", 500);
  }
};
