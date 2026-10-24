const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const User = require("../models/User");

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/"
};

function clearCookie(res, name) {
  res.clearCookie(name, cookieOptions);
}

function verifyToken(token) {
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function requireAdmin(req, res, next) {
  const decoded = verifyToken(req.cookies?.adminToken);
  if (!decoded || decoded.role !== "admin" || !decoded.id) {
    clearCookie(res, "adminToken");
    return res.status(401).json({ success: false, message: "Vui lòng đăng nhập Admin." });
  }

  try {
    const admin = await Admin.findById(decoded.id).select("username role").lean();
    if (!admin || admin.role !== "admin") {
      clearCookie(res, "adminToken");
      return res.status(401).json({ success: false, message: "Phiên quản trị không còn hợp lệ." });
    }
    req.admin = { id: String(admin._id), username: admin.username, role: "admin" };
    return next();
  } catch (error) {
    if (error.name === "CastError") {
      clearCookie(res, "adminToken");
      return res.status(401).json({ success: false, message: "Phiên quản trị không hợp lệ." });
    }
    return next(error);
  }
}

async function requireUser(req, res, next) {
  const decoded = verifyToken(req.cookies?.userToken);
  if (!decoded || decoded.role !== "user" || !decoded.id) {
    clearCookie(res, "userToken");
    return res.status(401).json({ success: false, message: "Vui lòng đăng nhập tài khoản thành viên." });
  }

  try {
    // Always read the live account so an administrator's ban takes effect even
    // when the member still has a valid JWT cookie from an earlier login.
    const user = await User.findById(decoded.id).select("username email emailVerified role isBanned banReason");
    if (!user || user.role !== "user" || !user.emailVerified) {
      clearCookie(res, "userToken");
      return res.status(401).json({ success: false, message: "Phiên thành viên không còn hợp lệ." });
    }
    if (user.isBanned) {
      clearCookie(res, "userToken");
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_BANNED",
        message: user.banReason ? `Tài khoản đã bị khóa. Lý do: ${user.banReason}` : "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên."
      });
    }
    req.member = user;
    return next();
  } catch (error) {
    if (error.name === "CastError") {
      clearCookie(res, "userToken");
      return res.status(401).json({ success: false, message: "Phiên thành viên không hợp lệ." });
    }
    return next(error);
  }
}

// Optional identity for public read-only endpoints. A banned user is treated
// as a guest here; write endpoints still must use requireUser.
async function optionalUser(req, res, next) {
  req.member = null;
  const decoded = verifyToken(req.cookies?.userToken);
  if (!decoded || decoded.role !== "user" || !decoded.id) return next();
  try {
    const user = await User.findById(decoded.id).select("username emailVerified role isBanned");
    if (user && user.emailVerified && user.role === "user" && !user.isBanned) req.member = user;
    else if (!user || user.isBanned) clearCookie(res, "userToken");
    return next();
  } catch {
    return next();
  }
}

module.exports = requireAdmin;
module.exports.requireAdmin = requireAdmin;
module.exports.requireUser = requireUser;
module.exports.optionalUser = optionalUser;
