//
const http = require("http");
const path = require("path");
const fs = require("fs");
const url = require("url");

const PORT = process.env.PORT || 5000;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const apiHandlers = {
  "/api/inbound-email": require("./api/inbound-email"),
  "/api/inbox": require("./api/inbox/index"),
  "/api/stream": require("./api/stream"),
  "/api/domains": require("./api/domains"),
  "/api/admin/dashboard": require("./api/admin/dashboard"),
  "/api/admin/login": require("./api/admin/login")
};

function patchRes(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (data) {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    }
    return res;
  };
  res.send = function (data) {
    if (!res.headersSent) res.end(String(data));
    return res;
  };
  res.flushHeaders = function () {
    if (!res.headersSent) res.writeHead(res.statusCode || 200);
  };
  return res;
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  patchRes(res);

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  req.query = parsed.query;
  req.headers = req.headers || {};

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (pathname.startsWith("/api/")) {
    const emailIdMatch = pathname.match(/^\/api\/emails\/(.+)$/);
    if (emailIdMatch) {
      req.query.id = emailIdMatch[1];
      req.body = await getBody(req);
      return require("./api/emails/[id]")(req, res);
    }

    const handler = apiHandlers[pathname];
    if (handler) {
      req.body = await getBody(req);
      return handler(req, res);
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Not found" }));
  }

  const isAdminPage = pathname === "/admin" || pathname === "/admin/" || pathname === "/admin.html";
  if (isAdminPage) {
    const cfg = require("./config");
    const expected = Buffer.from(`${cfg.admin.username}:${cfg.admin.password}`).toString("base64");
    const cookieStr = req.headers["cookie"] || "";
    const tokenMatch = cookieStr.match(/(?:^|;\s*)ng_admin=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : "";
    if (token !== expected) {
      res.writeHead(302, { "Location": "/admin-login.html" });
      return res.end();
    }
  }

  let filePath = pathname === "/" ? "/index.html"
    : (pathname === "/admin" || pathname === "/admin/") ? "/admin.html"
    : pathname;
  filePath = path.join(__dirname, "public", filePath);
  const ext = path.extname(filePath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, "public", "index.html");
  }

  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
  res.end(content);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NOXXY running on http://0.0.0.0:${PORT}`);
});
//