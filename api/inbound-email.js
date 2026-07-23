const connectDB = require("../lib/mongodb");
const Email = require("../lib/models/Email");
const Inbox = require("../lib/models/Inbox");
const Log = require("../lib/models/Log");
const { parseRawEmail } = require("../lib/mailparser");
const { calcSpamScore, sanitizeHTML } = require("../lib/utils");
const { sendToInbox } = require("../lib/sseManager");
//
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await connectDB();

    const body = req.body;
    if (!body || !body.to) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const toAddress = (body.to || "").toLowerCase().trim();

    const inbox = await Inbox.findOne({ address: toAddress, active: true });
    if (!inbox) {
      await Log.create({ type: "email", action: "rejected_no_inbox", target: toAddress });
      return res.status(200).json({ status: "no_inbox" });
    }

    const emailCount = await Email.countDocuments({ inboxId: inbox._id, deleted: false });
    const config = require("../config");
    if (emailCount >= config.inbox.maxEmailsPerInbox) {
      return res.status(200).json({ status: "inbox_full" });
    }

    let parsed = null;
    if (body.raw) {
      parsed = await parseRawEmail(body.raw);
    }

    const fromAddress = parsed?.from?.address || body.from || "";
    const fromName = parsed?.from?.name || fromAddress;
    const subject = parsed?.subject || body.subject || "(No Subject)";
    const html = sanitizeHTML(parsed?.html || "");
    const text = parsed?.text || "";
    const headers = parsed?.headers || {};
    const attachments = parsed?.attachments || [];
    const messageId = parsed?.messageId || body.messageId || "";

    const emailData = {
      from: { name: fromName, address: fromAddress },
      subject,
      html,
      text,
      headers,
      messageId
    };

    const spamScore = calcSpamScore(emailData);

    const email = await Email.create({
      inboxId: inbox._id,
      emailAddress: toAddress,
      from: { name: fromName, address: fromAddress },
      to: toAddress,
      subject,
      html,
      text,
      headers,
      attachments: attachments.map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        content: a.content
      })),
      messageId,
      spamScore,
      receivedAt: new Date()
    });

    await Inbox.findByIdAndUpdate(inbox._id, {
      $inc: { emailCount: 1 },
      lastActivity: new Date()
    });

    await Log.create({
      type: "email",
      action: "received",
      target: toAddress,
      meta: { from: fromAddress, subject, spamScore, emailId: email._id }
    });

    const emailPayload = {
      _id: email._id,
      from: email.from,
      subject: email.subject,
      text: email.text,
      html: email.html,
      receivedAt: email.receivedAt,
      spamScore: email.spamScore,
      read: false,
      attachmentCount: attachments.length
    };

    sendToInbox(toAddress, "new_email", emailPayload);

    return res.status(200).json({ status: "ok", emailId: email._id });
  } catch (err) {
    console.error("Inbound email error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
