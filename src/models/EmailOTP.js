const mongoose = require("mongoose");

const emailOTPSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ["register", "reset-password"], required: true },
  codeHash: { type: String, required: true },
  username: { type: String },       // Chỉ dùng cho đăng ký
  passwordHash: { type: String },   // Chỉ dùng cho đăng ký
  targetType: { type: String, enum: ["User", "Admin"] }, // Chỉ dùng cho khôi phục
  expiresAt: { type: Date, required: true, expires: 0 },
  attempts: { type: Number, default: 0 }
}, { timestamps: true });

emailOTPSchema.index({ email: 1, purpose: 1 }, { unique: true });
module.exports = mongoose.model("EmailOTP", emailOTPSchema);
