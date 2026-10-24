const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  emailVerified: { type: Boolean, default: false },
  role: { type: String, enum: ["user"], default: "user" },
  isBanned: { type: Boolean, default: false, index: true },
  banReason: { type: String, default: "", maxlength: 500 },
  bannedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
