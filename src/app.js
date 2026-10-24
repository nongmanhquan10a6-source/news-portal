require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const connectDB = require("./config/db");
const Article = require("./models/Article");
const Admin = require("./models/Admin");
const User = require("./models/User");
const Comment = require("./models/Comment");
const Reaction = require("./models/Reaction");
const EmailOTP = require("./models/EmailOTP");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const auth = require("./middleware/auth");
const requireAdmin = auth.requireAdmin || auth;
const requireUser = auth.requireUser;
const optionalUser = auth.optionalUser;
const { sendOTPEmail } = require("./config/mailer");

const app = express();
app.use(express.json({ limit: "512kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau 15 phút." }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Bạn thử quá nhiều lần. Vui lòng thử lại sau 15 phút." }
});
const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Bạn bình luận quá nhanh. Vui lòng thử lại sau một phút." }
});

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function hashOTP(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}
function makeOTP() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}
function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 72;
}
async function saveAndSendOTP({ email, purpose, username, passwordHash, targetType }) {
  const otp = makeOTP();
  await EmailOTP.findOneAndUpdate(
    { email, purpose },
    {
      $set: {
        email, purpose, codeHash: hashOTP(otp),
        username, passwordHash, targetType,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  try {
    await sendOTPEmail(email, otp, purpose);
  } catch (error) {
    await EmailOTP.deleteOne({ email, purpose });
    console.error("Gửi email OTP thất bại:", error.message);
    throw new Error("Không gửi được email. Hãy kiểm tra cấu hình Gmail SMTP.");
  }
}

// 1. ĐĂNG NHẬP ADMIN (giữ nguyên luồng hiện tại)
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên đăng nhập và mật khẩu." });
    }
    const admin = await Admin.findOne({ username: username.trim() });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ success: false, message: "Tên đăng nhập hoặc mật khẩu không đúng." });
    }
    if (!process.env.JWT_SECRET) throw new Error("Chưa cấu hình JWT_SECRET");
    const token = jwt.sign({ id: admin._id.toString(), username: admin.username, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.cookie("adminToken", token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/"
    });
    return res.json({ success: true, message: "Đăng nhập thành công", username: admin.username });
  } catch (error) {
    console.error("Lỗi đăng nhập admin:", error.message);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
});

// 2. ĐĂNG KÝ: gửi OTP xác minh email
app.post("/api/auth/register/request-otp", otpLimiter, async (req, res) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ success: false, message: "Tên tài khoản phải dài từ 3 đến 30 ký tự." });
    }
    if (!validEmail(email)) return res.status(400).json({ success: false, message: "Email không hợp lệ." });
    if (!validPassword(password)) return res.status(400).json({ success: false, message: "Mật khẩu phải dài từ 8 đến 72 ký tự." });

    const [existingUsername, existingUserEmail, existingAdminEmail] = await Promise.all([
      User.findOne({ username }),
      User.findOne({ email }),
      Admin.findOne({ email })
    ]);
    if (existingUsername) return res.status(409).json({ success: false, message: "Tên tài khoản đã được sử dụng." });
    if (existingUserEmail || existingAdminEmail) return res.status(409).json({ success: false, message: "Email đã được liên kết với tài khoản khác." });

    const passwordHash = await bcrypt.hash(password, 12);
    await saveAndSendOTP({ email, purpose: "register", username, passwordHash });
    return res.json({ success: true, message: "Nếu email có thể nhận thư, mã xác minh đã được gửi. Mã có hiệu lực 5 phút." });
  } catch (error) {
    console.error("Lỗi yêu cầu đăng ký:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Không thể gửi mã xác minh." });
  }
});

// 3. ĐĂNG KÝ: xác minh OTP và tạo tài khoản
app.post("/api/auth/register/verify-otp", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: "Email hoặc mã OTP không hợp lệ." });
    }
    const record = await EmailOTP.findOne({ email, purpose: "register" });
    if (!record || record.expiresAt <= new Date()) {
      return res.status(400).json({ success: false, message: "Mã OTP không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới." });
    }
    if (record.attempts >= 5) {
      await EmailOTP.deleteOne({ _id: record._id });
      return res.status(429).json({ success: false, message: "Bạn nhập sai quá nhiều lần. Hãy yêu cầu mã mới." });
    }
    if (hashOTP(otp) !== record.codeHash) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, message: "Mã OTP không chính xác." });
    }
    const duplicate = await User.findOne({ $or: [{ email }, { username: record.username }] });
    if (duplicate) {
      await EmailOTP.deleteOne({ _id: record._id });
      return res.status(409).json({ success: false, message: "Tên tài khoản hoặc email đã được sử dụng." });
    }
    await User.create({
      username: record.username,
      email,
      password: record.passwordHash,
      emailVerified: true,
      role: "user"
    });
    await EmailOTP.deleteOne({ _id: record._id });
    return res.status(201).json({ success: true, message: "Đăng ký thành công. Bạn có thể đăng nhập." });
  } catch (error) {
    console.error("Lỗi xác minh đăng ký:", error.message);
    return res.status(500).json({ success: false, message: "Không thể hoàn tất đăng ký." });
  }
});

// 4. ĐĂNG NHẬP NGƯỜI DÙNG THƯỜNG (cookie riêng, không có quyền admin)
app.post("/api/auth/user/login", authLimiter, async (req, res) => {
  try {
    const usernameOrEmail = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = req.body?.password;
    if (!usernameOrEmail || !password) return res.status(400).json({ success: false, message: "Vui lòng nhập tài khoản và mật khẩu." });

    const user = await User.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail.toLowerCase() }]
    });
    if (!user || !user.emailVerified || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Tài khoản hoặc mật khẩu không đúng." });
    }
    if (user.isBanned) {
      res.clearCookie("userToken", sessionCookieOptions);
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_BANNED",
        message: user.banReason ? `Tài khoản đã bị khóa. Lý do: ${user.banReason}` : "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên."
      });
    }
    if (!process.env.JWT_SECRET) throw new Error("Chưa cấu hình JWT_SECRET");
    const token = jwt.sign({ id: user._id.toString(), username: user.username, role: "user" }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.cookie("userToken", token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/"
    });
    return res.json({ success: true, message: "Đăng nhập thành công.", username: user.username });
  } catch (error) {
    console.error("Lỗi đăng nhập người dùng:", error.message);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
});

// 5. QUÊN MẬT KHẨU: yêu cầu gửi OTP (áp dụng cho User và Admin có email)
app.post("/api/auth/password/request-reset", otpLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return res.status(400).json({ success: false, message: "Email không hợp lệ." });
  try {
    const user = await User.findOne({ email, emailVerified: true });
    const admin = user ? null : await Admin.findOne({ email });
    const account = user || admin;
    // Phản hồi chung để không tiết lộ email có đăng ký hay không.
    if (account) {
      await saveAndSendOTP({ email, purpose: "reset-password", targetType: user ? "User" : "Admin" });
    }
    return res.json({ success: true, message: "Nếu email đã liên kết với tài khoản, mã OTP sẽ được gửi đến hộp thư đó." });
  } catch (error) {
    console.error("Lỗi yêu cầu đặt lại mật khẩu:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xử lý yêu cầu lúc này." });
  }
});

// 6. QUÊN MẬT KHẨU: xác minh OTP và đổi mật khẩu
app.post("/api/auth/password/reset", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const newPassword = req.body?.newPassword;

    if (!validEmail(email) || !/^\d{6}$/.test(otp) || !validPassword(newPassword)) {
      return res.status(400).json({ success: false, message: "Email, mã OTP hoặc mật khẩu mới không hợp lệ. Mật khẩu phải có ít nhất 8 ký tự." });
    }
    const record = await EmailOTP.findOne({ email, purpose: "reset-password" });
    if (!record || record.expiresAt <= new Date()) {
      return res.status(400).json({ success: false, message: "Mã OTP không đúng hoặc đã hết hạn." });
    }
    if (record.attempts >= 5) {
      await EmailOTP.deleteOne({ _id: record._id });
      return res.status(429).json({ success: false, message: "Bạn nhập sai quá nhiều lần. Hãy yêu cầu mã mới." });
    }
    if (hashOTP(otp) !== record.codeHash) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, message: "Mã OTP không chính xác." });
    }
    const Model = record.targetType === "Admin" ? Admin : User;
    const account = await Model.findOne({ email });
    if (!account) {
      await EmailOTP.deleteOne({ _id: record._id });
      return res.status(400).json({ success: false, message: "Không thể xác minh tài khoản. Hãy yêu cầu mã mới." });
    }
    account.password = await bcrypt.hash(newPassword, 12);
    await account.save();
    await EmailOTP.deleteOne({ _id: record._id });
    return res.json({ success: true, message: "Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới." });
  } catch (error) {
    console.error("Lỗi đặt lại mật khẩu:", error.message);
    return res.status(500).json({ success: false, message: "Không thể đặt lại mật khẩu." });
  }
});

// Tùy chọn cookie dùng thống nhất cả khi đăng nhập và đăng xuất.
const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/"
};

// Đăng xuất riêng admin; không xóa phiên người dùng thông thường.
app.post("/api/auth/admin/logout", (req, res) => {
  res.clearCookie("adminToken", sessionCookieOptions);
  return res.json({ success: true, message: "Đã đăng xuất quản trị viên." });
});

// Đăng xuất riêng người dùng; không xóa phiên admin.
app.post("/api/auth/user/logout", (req, res) => {
  res.clearCookie("userToken", sessionCookieOptions);
  return res.json({ success: true, message: "Đã đăng xuất tài khoản người dùng." });
});

// Tương thích endpoint cũ nhưng không bao giờ xóa cả hai phiên cùng lúc.
app.post("/api/auth/logout", (req, res) => {
  const role = req.body?.role;
  if (role === "admin") {
    res.clearCookie("adminToken", sessionCookieOptions);
    return res.json({ success: true, message: "Đã đăng xuất quản trị viên." });
  }
  if (role === "user") {
    res.clearCookie("userToken", sessionCookieOptions);
    return res.json({ success: true, message: "Đã đăng xuất tài khoản người dùng." });
  }

  // Tương thích với các trang cũ chỉ khi duy nhất một cookie đang tồn tại.
  if (req.cookies?.adminToken && !req.cookies?.userToken) {
    res.clearCookie("adminToken", sessionCookieOptions);
    return res.json({ success: true, message: "Đã đăng xuất quản trị viên." });
  }
  if (req.cookies?.userToken && !req.cookies?.adminToken) {
    res.clearCookie("userToken", sessionCookieOptions);
    return res.json({ success: true, message: "Đã đăng xuất tài khoản người dùng." });
  }

  return res.status(400).json({
    success: false,
    message: "Hãy chỉ rõ tài khoản cần đăng xuất."
  });
});

// Trả trạng thái đăng nhập cho giao diện điều hướng. Endpoint này chỉ hiển thị
// danh tính đã xác thực; quyền API vẫn được kiểm tra riêng bởi middleware.
app.get("/api/auth/session", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const session = { success: true, admin: null, user: null };

  const adminToken = req.cookies?.adminToken;
  if (adminToken) {
    try {
      const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (decoded.role === "admin" && decoded.id && decoded.username) {
        const admin = await Admin.findById(decoded.id).select("username role").lean();
        if (admin && admin.role === "admin") {
          session.admin = { id: String(admin._id), username: admin.username, role: "admin" };
        } else {
          res.clearCookie("adminToken", sessionCookieOptions);
        }
      } else {
        res.clearCookie("adminToken", sessionCookieOptions);
      }
    } catch {
      res.clearCookie("adminToken", sessionCookieOptions);
    }
  }

  const userToken = req.cookies?.userToken;
  if (userToken) {
    try {
      const decoded = jwt.verify(userToken, process.env.JWT_SECRET);
      if (decoded.role === "user" && decoded.id) {
        // Read live account status: do not report a banned member as logged in.
        const member = await User.findById(decoded.id).select("username emailVerified role isBanned").lean();
        if (member && member.role === "user" && member.emailVerified && !member.isBanned) {
          session.user = { id: String(member._id), username: member.username, role: "user" };
        } else {
          res.clearCookie("userToken", sessionCookieOptions);
        }
      } else {
        res.clearCookie("userToken", sessionCookieOptions);
      }
    } catch {
      res.clearCookie("userToken", sessionCookieOptions);
    }
  }

  return res.json(session);
});

// Kiểm tra phiên admin cho các API quản trị.
app.get("/api/auth/me", requireAdmin, (req, res) => {
  return res.json({ success: true, admin: req.admin });
});

// Helpers dùng chung cho kiểm tra đầu vào và xóa dữ liệu phụ thuộc.
const REACTION_TYPES = ["like", "haha", "sad", "love", "angry"];
const ARTICLE_STATUSES = ["draft", "published"];
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const cleanText = (value) => typeof value === "string" ? value.trim() : "";

function validOptionalHttpUrl(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateArticlePayload(body, { partial = false } = {}) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const data = {};
  const fields = ["title", "slug", "summary", "content", "imageUrl", "sourceUrl", "category", "author", "status"];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) data[field] = input[field];
  }

  for (const field of ["title", "slug", "content", "summary", "imageUrl", "sourceUrl", "category", "author", "status"]) {
    if (data[field] !== undefined && typeof data[field] !== "string") {
      return { error: `Trường ${field} phải là văn bản.` };
    }
  }

  if (!partial || data.title !== undefined) {
    data.title = cleanText(data.title);
    if (!data.title || data.title.length > 200) return { error: "Tiêu đề không được để trống và tối đa 200 ký tự." };
  }
  if (!partial || data.slug !== undefined) {
    data.slug = cleanText(data.slug).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) return { error: "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang." };
  }
  if (!partial || data.content !== undefined) {
    data.content = cleanText(data.content);
    if (!data.content || data.content.length > 100000) return { error: "Nội dung bài viết không được để trống và tối đa 100.000 ký tự." };
  }
  for (const field of ["summary", "category", "author"]) {
    if (data[field] !== undefined) data[field] = cleanText(data[field]);
  }
  for (const field of ["imageUrl", "sourceUrl"]) {
    if (data[field] !== undefined) {
      data[field] = cleanText(data[field]);
      if (!validOptionalHttpUrl(data[field])) return { error: `${field} chỉ được dùng đường dẫn HTTP hoặc HTTPS hợp lệ.` };
    }
  }
  if (data.status !== undefined && !ARTICLE_STATUSES.includes(data.status)) return { error: "Trạng thái bài viết không hợp lệ." };
  if (!partial) {
    data.summary ??= "";
    data.imageUrl ??= "";
    data.sourceUrl ??= "";
    data.category ||= "Tin mới";
    data.author ||= "Ban biên tập";
    data.status ||= "draft";
  }
  return { data };
}

async function deleteCommentTree(commentId) {
  const allIds = [];
  let frontier = [new mongoose.Types.ObjectId(String(commentId))];
  while (frontier.length) {
    const current = frontier;
    allIds.push(...current);
    const children = await Comment.find({ parent: { $in: current } }).select("_id").lean();
    const seen = new Set(allIds.map(String));
    frontier = children.map((item) => item._id).filter((id) => !seen.has(String(id)));
  }
  if (allIds.length) {
    await Reaction.deleteMany({ comment: { $in: allIds } });
    await Comment.deleteMany({ _id: { $in: allIds } });
  }
  return allIds.length;
}

async function attachReactionData(comments, memberId = null) {
  if (!comments.length) return comments;
  const ids = comments.map((comment) => comment._id);
  const grouped = await Reaction.aggregate([
    { $match: { comment: { $in: ids } } },
    { $group: { _id: { comment: "$comment", type: "$type" }, count: { $sum: 1 } } }
  ]);
  const countsByComment = new Map();
  for (const row of grouped) {
    const key = String(row._id.comment);
    if (!countsByComment.has(key)) countsByComment.set(key, { like: 0, haha: 0, sad: 0, love: 0, angry: 0 });
    countsByComment.get(key)[row._id.type] = row.count;
  }
  const mine = memberId
    ? await Reaction.find({ comment: { $in: ids }, user: memberId }).select("comment type").lean()
    : [];
  const mineMap = new Map(mine.map((item) => [String(item.comment), item.type]));

  return comments.map((comment) => {
    const author = comment.user && typeof comment.user === "object"
      ? { _id: String(comment.user._id), username: comment.user.username || "Thành viên đã xóa" }
      : { _id: "", username: "Thành viên đã xóa" };
    return {
      _id: String(comment._id),
      article: String(comment.article),
      user: author,
      parent: comment.parent ? String(comment.parent) : null,
      content: comment.content,
      isDeleted: Boolean(comment.isDeleted),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      reactionCounts: countsByComment.get(String(comment._id)) || { like: 0, haha: 0, sad: 0, love: 0, angry: 0 },
      myReaction: mineMap.get(String(comment._id)) || null
    };
  });
}

// 9. API BÀI VIẾT CÔNG KHAI.
app.get("/api/articles", async (req, res) => {
  try {
    const articles = await Article.find({ status: "published" }).sort({ publishedAt: -1, createdAt: -1 }).lean();
    return res.json({ success: true, count: articles.length, data: articles });
  } catch (error) {
    console.error("Lỗi lấy danh sách bài viết:", error.message);
    return res.status(500).json({ success: false, message: "Không thể lấy danh sách bài viết." });
  }
});

app.get("/api/articles/:slug", async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug, status: "published" }).lean();
    if (!article) return res.status(404).json({ success: false, message: "Không tìm thấy bài viết." });
    return res.json({ success: true, data: article });
  } catch (error) {
    console.error("Lỗi lấy chi tiết bài viết:", error.message);
    return res.status(500).json({ success: false, message: "Không thể lấy chi tiết bài viết." });
  }
});

// Danh sách bài viết cho trang quản trị, gồm cả bản nháp.
app.get("/api/admin/articles", requireAdmin, async (req, res) => {
  try {
    const articles = await Article.find({}).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: articles });
  } catch (error) {
    console.error("Lỗi lấy bài viết quản trị:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách bài viết." });
  }
});

// Tạo bài viết - chỉ Admin.
app.post("/api/articles", requireAdmin, async (req, res) => {
  try {
    const { data, error } = validateArticlePayload(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    data.publishedAt = data.status === "published" ? new Date() : null;
    const article = await Article.create(data);
    return res.status(201).json({ success: true, message: "Tạo bài viết thành công.", data: article });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "Slug này đã được sử dụng. Hãy chọn đường dẫn khác." });
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: "Dữ liệu bài viết không hợp lệ." });
    console.error("Lỗi tạo bài viết:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tạo bài viết." });
  }
});

// Sửa bài viết - dùng slug cũ để xác định bài, có thể đổi sang slug mới.
app.put("/api/articles/:slug", requireAdmin, async (req, res) => {
  try {
    const { data, error } = validateArticlePayload(req.body, { partial: true });
    if (error) return res.status(400).json({ success: false, message: error });
    if (!Object.keys(data).length) return res.status(400).json({ success: false, message: "Không có trường nào cần cập nhật." });

    const article = await Article.findOne({ slug: req.params.slug });
    if (!article) return res.status(404).json({ success: false, message: "Không tìm thấy bài viết cần sửa." });
    const wasPublished = article.status === "published" && article.publishedAt;
    for (const [key, value] of Object.entries(data)) article[key] = value;
    if (article.status === "published") article.publishedAt = wasPublished || new Date();
    else article.publishedAt = null;
    await article.save();
    return res.json({ success: true, message: "Cập nhật bài viết thành công.", data: article });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "Slug này đã được sử dụng. Hãy chọn đường dẫn khác." });
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: "Dữ liệu bài viết không hợp lệ." });
    console.error("Lỗi sửa bài viết:", error.message);
    return res.status(500).json({ success: false, message: "Không thể cập nhật bài viết." });
  }
});

// Xóa bài và toàn bộ bình luận/cảm xúc phụ thuộc để không còn dữ liệu mồ côi.
app.delete("/api/articles/:slug", requireAdmin, async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug });
    if (!article) return res.status(404).json({ success: false, message: "Không tìm thấy bài viết cần xóa." });
    const commentIds = await Comment.find({ article: article._id }).distinct("_id");
    if (commentIds.length) await Reaction.deleteMany({ comment: { $in: commentIds } });
    await Comment.deleteMany({ article: article._id });
    await article.deleteOne();
    return res.json({ success: true, message: "Đã xóa bài viết và các bình luận liên quan." });
  } catch (error) {
    console.error("Lỗi xóa bài viết:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa bài viết." });
  }
});

// Xem bình luận công khai; người chưa đăng nhập vẫn được đọc.
app.get("/api/articles/:slug/comments", optionalUser, async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug, status: "published" }).select("_id").lean();
    if (!article) return res.status(404).json({ success: false, message: "Không tìm thấy bài viết." });
    const comments = await Comment.find({ article: article._id })
      .sort({ createdAt: 1 })
      .populate({ path: "user", select: "username" })
      .lean();
    const data = await attachReactionData(comments, req.member?._id || null);
    return res.json({ success: true, count: data.length, data, canComment: Boolean(req.member) });
  } catch (error) {
    console.error("Lỗi lấy bình luận:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải bình luận." });
  }
});

// Đăng bình luận mới hoặc trả lời một bình luận cùng bài viết.
app.post("/api/articles/:slug/comments", requireUser, commentLimiter, async (req, res) => {
  try {
    const content = cleanText(req.body?.content);
    const parentId = req.body?.parentId ? String(req.body.parentId) : "";
    if (!content || content.length > 2000) {
      return res.status(400).json({ success: false, message: "Bình luận phải có nội dung và tối đa 2.000 ký tự." });
    }
    const article = await Article.findOne({ slug: req.params.slug, status: "published" }).select("_id").lean();
    if (!article) return res.status(404).json({ success: false, message: "Không tìm thấy bài viết." });
    let parent = null;
    if (parentId) {
      if (!isObjectId(parentId)) return res.status(400).json({ success: false, message: "Bình luận trả lời không hợp lệ." });
      parent = await Comment.findOne({ _id: parentId, article: article._id, isDeleted: { $ne: true } }).select("_id").lean();
      if (!parent) return res.status(400).json({ success: false, message: "Bình luận cần trả lời không tồn tại hoặc đã bị xóa." });
    }
    const comment = await Comment.create({ article: article._id, user: req.member._id, parent: parent?._id || null, content });
    const result = await Comment.findById(comment._id).populate({ path: "user", select: "username" }).lean();
    const [formatted] = await attachReactionData([result], req.member._id);
    return res.status(201).json({ success: true, message: parent ? "Đã gửi câu trả lời." : "Đã gửi bình luận.", data: formatted });
  } catch (error) {
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: "Nội dung bình luận không hợp lệ." });
    console.error("Lỗi tạo bình luận:", error.message);
    return res.status(500).json({ success: false, message: "Không thể gửi bình luận." });
  }
});

// Thành viên chỉ được xóa bình luận do chính mình viết.
app.delete("/api/comments/:id", requireUser, commentLimiter, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "ID bình luận không hợp lệ." });
    const comment = await Comment.findById(req.params.id).select("user").lean();
    if (!comment) return res.status(404).json({ success: false, message: "Không tìm thấy bình luận." });
    if (String(comment.user) !== String(req.member._id)) {
      return res.status(403).json({ success: false, message: "Bạn chỉ có thể xóa bình luận của chính mình." });
    }
    const replyCount = await Comment.countDocuments({ parent: comment._id });
    if (replyCount > 0) {
      // Hide the author's content without deleting replies written by other members.
      await Comment.updateOne({ _id: comment._id }, { $set: { isDeleted: true, content: "Bình luận này đã bị xóa." } });
      await Reaction.deleteMany({ comment: comment._id });
      return res.json({ success: true, message: "Đã xóa nội dung bình luận. Các câu trả lời khác được giữ lại." });
    }
    await deleteCommentTree(comment._id);
    return res.json({ success: true, message: "Đã xóa bình luận." });
  } catch (error) {
    console.error("Lỗi xóa bình luận của thành viên:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa bình luận." });
  }
});

// Một thành viên chỉ có một cảm xúc hiện tại trên mỗi bình luận. Chọn lại
// đúng cảm xúc đang chọn sẽ gỡ cảm xúc; chọn loại khác sẽ thay cảm xúc cũ.
app.post("/api/comments/:id/react", requireUser, commentLimiter, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "ID bình luận không hợp lệ." });
    const type = req.body?.type;
    if (!REACTION_TYPES.includes(type)) return res.status(400).json({ success: false, message: "Loại cảm xúc không hợp lệ." });
    const comment = await Comment.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).select("_id article").lean();
    if (!comment) return res.status(404).json({ success: false, message: "Không tìm thấy bình luận hoặc bình luận đã bị xóa." });
    const publishedArticle = await Article.exists({ _id: comment.article, status: "published" });
    if (!publishedArticle) return res.status(404).json({ success: false, message: "Bài viết này hiện không nhận cảm xúc." });

    const existing = await Reaction.findOne({ comment: comment._id, user: req.member._id });
    if (existing && existing.type === type) {
      await existing.deleteOne();
      return res.json({ success: true, myReaction: null, message: "Đã gỡ cảm xúc." });
    }
    try {
      await Reaction.findOneAndUpdate(
        { comment: comment._id, user: req.member._id },
        { $set: { type } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      await Reaction.updateOne({ comment: comment._id, user: req.member._id }, { $set: { type } }, { runValidators: true });
    }
    return res.json({ success: true, myReaction: type, message: "Đã cập nhật cảm xúc." });
  } catch (error) {
    console.error("Lỗi thả cảm xúc:", error.message);
    return res.status(500).json({ success: false, message: "Không thể cập nhật cảm xúc." });
  }
});

app.delete("/api/comments/:id/react", requireUser, commentLimiter, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "ID bình luận không hợp lệ." });
    await Reaction.deleteOne({ comment: req.params.id, user: req.member._id });
    return res.json({ success: true, myReaction: null, message: "Đã gỡ cảm xúc." });
  } catch (error) {
    console.error("Lỗi gỡ cảm xúc:", error.message);
    return res.status(500).json({ success: false, message: "Không thể gỡ cảm xúc." });
  }
});

// Admin xem toàn bộ bình luận để kiểm duyệt và xóa nội dung vi phạm.
app.get("/api/admin/comments", requireAdmin, async (req, res) => {
  try {
    const comments = await Comment.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .populate({ path: "user", select: "username" })
      .populate({ path: "article", select: "title slug" })
      .lean();
    const data = comments.map((comment) => ({
      _id: String(comment._id),
      content: comment.content,
      createdAt: comment.createdAt,
      parent: comment.parent ? String(comment.parent) : null,
      isDeleted: Boolean(comment.isDeleted),
      user: { username: comment.user?.username || "Thành viên đã xóa" },
      article: comment.article ? { title: comment.article.title, slug: comment.article.slug } : { title: "Bài viết đã xóa", slug: "" }
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Lỗi tải bình luận quản trị:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách bình luận." });
  }
});

app.delete("/api/admin/comments/:id", requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "ID bình luận không hợp lệ." });
    const comment = await Comment.findById(req.params.id).select("_id").lean();
    if (!comment) return res.status(404).json({ success: false, message: "Không tìm thấy bình luận." });
    const deletedCount = await deleteCommentTree(comment._id);
    return res.json({
      success: true,
      message: deletedCount > 1 ? `Đã xóa bình luận và ${deletedCount - 1} câu trả lời liên quan.` : "Đã xóa bình luận."
    });
  } catch (error) {
    console.error("Lỗi Admin xóa bình luận:", error.message);
    return res.status(500).json({ success: false, message: "Không thể xóa bình luận." });
  }
});

// Quản lý tài khoản thành viên. Chỉ trả các trường cần thiết cho giao diện admin.
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select("username email emailVerified isBanned banReason bannedAt createdAt")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    return res.json({ success: true, data: users.map((user) => ({
      _id: String(user._id), username: user.username, email: user.email,
      emailVerified: Boolean(user.emailVerified), isBanned: Boolean(user.isBanned),
      banReason: user.banReason || "", bannedAt: user.bannedAt || null, createdAt: user.createdAt
    })) });
  } catch (error) {
    console.error("Lỗi tải danh sách thành viên:", error.message);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách thành viên." });
  }
});

app.post("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "ID tài khoản không hợp lệ." });
    const reason = cleanText(req.body?.reason);
    if (!reason || reason.length < 3 || reason.length > 500) {
      return res.status(400).json({ success: false, message: "Lý do khóa phải dài từ 3 đến 500 ký tự." });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBanned: true, banReason: reason, bannedAt: new Date() } },
      { new: true, runValidators: true }
    ).select("username isBanned banReason bannedAt");
    if (!user) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản thành viên." });
    // Stateless JWT cookies are invalidated by requireUser/session checks on the
    // very next request because these middleware always consult MongoDB.
    return res.json({ success: true, message: `Đã khóa tài khoản ${user.username}.`, data: { id: String(user._id), isBanned: true, banReason: user.banReason } });
  } catch (error) {
    console.error("Lỗi khóa tài khoản:", error.message);
    return res.status(500).json({ success: false, message: "Không thể khóa tài khoản." });
  }
});

app.post("/api/admin/users/:id/unban", requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "ID tài khoản không hợp lệ." });
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBanned: false, banReason: "", bannedAt: null } },
      { new: true, runValidators: true }
    ).select("username isBanned");
    if (!user) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản thành viên." });
    return res.json({ success: true, message: `Đã mở khóa tài khoản ${user.username}.`, data: { id: String(user._id), isBanned: false } });
  } catch (error) {
    console.error("Lỗi mở khóa tài khoản:", error.message);
    return res.status(500).json({ success: false, message: "Không thể mở khóa tài khoản." });
  }
});

async function startServer() {
  try {
    if (!process.env.JWT_SECRET) throw new Error("Thiếu JWT_SECRET trong .env");
    await connectDB();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));
  } catch (error) {
    console.error("Không thể khởi động server:", error.message);
    process.exit(1);
  }
}
startServer();
