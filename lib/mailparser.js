const { simpleParser } = require("mailparser");

async function parseRawEmail(rawEmail) {
  try {
    const parsed = await simpleParser(rawEmail, {
      skipHtmlToText: false,
      skipImageLinks: false,
      skipTextToHtml: false
    });

    const fromAddress = parsed.from?.value?.[0]?.address || "";
    const fromName = parsed.from?.value?.[0]?.name || fromAddress;
    const toAddress = parsed.to?.value?.[0]?.address || "";

    const headers = {};
    if (parsed.headers) {
      parsed.headers.forEach((value, key) => {
        headers[key] = Array.isArray(value) ? value.join("; ") : String(value);
      });
    }

    const attachments = (parsed.attachments || []).map(att => ({
      filename: att.filename || "attachment",
      contentType: att.contentType || "application/octet-stream",
      size: att.size || 0,
      content: att.content
    }));

    return {
      from: { name: fromName, address: fromAddress },
      to: toAddress,
      subject: parsed.subject || "(No Subject)",
      html: parsed.html || "",
      text: parsed.text || "",
      headers,
      attachments,
      messageId: parsed.messageId || "",
      date: parsed.date || new Date()
    };
  } catch (err) {
    console.error("Mail parse error:", err);
    return null;
  }
}

module.exports = { parseRawEmail };
