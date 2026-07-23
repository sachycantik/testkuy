const mongoose = require("mongoose");

const LogSchema = new mongoose.Schema({
  type: { type: String, enum: ["email", "inbox", "error", "abuse", "admin"], required: true },
  action: { type: String, required: true },
  ip: String,
  target: String,
  meta: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: 604800 }
});

LogSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.models.Log || mongoose.model("Log", LogSchema);
//