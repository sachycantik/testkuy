export default {
  async email(message, env, ctx) {
    try {
      const rawEmail = await new Response(message.raw).text();

      const emailData = {
        from: message.from,
        to: message.to,
        subject: message.headers.get("subject") || "",
        date: message.headers.get("date") || "",
        messageId: message.headers.get("message-id") || "",
        raw: rawEmail,
        receivedAt: new Date().toISOString()
      };

      const res = await fetch("https://noxxyrorr.biz.id/api/inbound-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Noxxyrorr-Mail-Worker"
        },
        body: JSON.stringify(emailData)
      });

      console.log("Forwarded email:", message.to, "→ status", res.status);

    } catch (err) {
      console.error("Email processing failed:", err);
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        worker: "noxxy-email-worker",
        time: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>NOXXY Email Worker</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #f0f0f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #111118; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 40px 48px; text-align: center; max-width: 420px; }
    .dot { width: 10px; height: 10px; background: #10b981; border-radius: 50%; display: inline-block; margin-right: 8px; box-shadow: 0 0 8px #10b981; }
    h1 { font-size: 22px; font-weight: 700; margin: 16px 0 8px; letter-spacing: -0.5px; }
    p { color: #9090a8; font-size: 14px; line-height: 1.6; }
    code { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); padding: 2px 8px; border-radius: 6px; font-size: 13px; color: #818cf8; }
  </style>
</head>
<body>
  <div class="card">
    <div><span class="dot"></span><span style="color:#10b981;font-size:13px;font-weight:500">Active</span></div>
    <h1>NOXXY Email Worker</h1>
    <p>Worker ini aktif memproses email masuk untuk domain <code>noxxyrorr.biz.id</code> dan meneruskannya ke NOXXY secara real-time.</p>
    <p style="margin-top:20px;font-size:12px;color:#5a5a72">Cloudflare Email Worker — tidak dapat diakses via HTTP</p>
  </div>
</body>
</html>`, {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  }
};
