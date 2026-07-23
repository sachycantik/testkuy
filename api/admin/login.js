const config = require("../../config");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, password } = req.body || {};

  if (
    username === config.admin.username &&
    password === config.admin.password
  ) {
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    const maxAge = 60 * 60 * 8;
    res.setHeader(
      "Set-Cookie",
      `ng_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
    );
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ success: false, error: "Invalid username or password" });
};
//