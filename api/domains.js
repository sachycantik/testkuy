const config = require("../config");
const { successResponse, errorResponse } = require("../lib/utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return errorResponse(res, "Method not allowed", 405);
  return successResponse(res, { domains: config.domains });
};
//