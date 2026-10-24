const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  // Email optional để tương thích với tài khoản admin đã tồn tại.
  // Thêm email cho admin trong Atlas nếu muốn khôi phục mật khẩu admin bằng OTP.
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin"], default: "admin" }
}, { timestamps: true });

module.exports = mongoose.model("Admin", adminSchema);
