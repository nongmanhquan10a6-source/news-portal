
require("dotenv").config({
  path: require("path").join(__dirname, "../.env")
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("./models/Admin");

async function createAdmin() {
  try {
    const {
      MONGO_URI,
      ADMIN_USERNAME,
      ADMIN_PASSWORD,
      JWT_SECRET
    } = process.env;

    if (!MONGO_URI || !ADMIN_USERNAME ||
        !ADMIN_PASSWORD || !JWT_SECRET) {
      throw new Error(
        "Thieu cau hinh trong file .env"
      );
    }

    await mongoose.connect(MONGO_URI);

    const username = ADMIN_USERNAME.trim();
    const existing = await Admin.findOne({ username });

    if (existing) {
      console.log("Tai khoan Admin da ton tai.");
      return;
    }

    const passwordHash = await bcrypt.hash(
      ADMIN_PASSWORD,
      12
    );

    await Admin.create({
      username,
      password: passwordHash,
      role: "admin"
    });

    console.log("Da tao tai khoan Admin thanh cong!");
    console.log("Ten dang nhap:", username);
  } catch (error) {
    console.error("Loi tao Admin:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

createAdmin();
