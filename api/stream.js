const { addClient, removeClient } = require("../lib/sseManager");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: "Address required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const inbox = address.toLowerCase();
  addClient(inbox, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ address: inbox })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(inbox, res);
  });
};
//