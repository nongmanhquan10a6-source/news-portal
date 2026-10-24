const nodemailer = require("nodemailer");

const email = process.env.SMTP_EMAIL;
const password = process.env.SMTP_APP_PASSWORD;

if (!email || !password) {
  throw new Error("Thiếu SMTP_EMAIL hoặc SMTP_APP_PASSWORD trong file .env");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: email, pass: password }
});

async function sendOTPEmail(to, otp, purpose) {
  const isRegister = purpose === "register";
  return transporter.sendMail({
    from: `"News Portal" <${email}>`,
    to,
    subject: isRegister ? "Xác minh email đăng ký News Portal" : "Mã đặt lại mật khẩu News Portal",
    text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong 5 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17231f">
      <h2>${isRegister ? "Xác minh email" : "Đặt lại mật khẩu"}</h2>
      <p>${isRegister ? "Nhập mã dưới đây để hoàn tất đăng ký tài khoản News Portal." : "Bạn vừa yêu cầu đặt lại mật khẩu tài khoản News Portal."}</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p>
      <p>Mã có hiệu lực trong <b>5 phút</b>, chỉ sử dụng một lần. Không chia sẻ mã này với bất kỳ ai.</p>
      <p>Nếu không phải bạn thực hiện yêu cầu này, hãy bỏ qua email.</p>
    </div>`
  });
}

module.exports = { sendOTPEmail };
