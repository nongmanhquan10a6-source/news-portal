
require("dotenv").config({
  path: require("path").join(__dirname, "../../.env")
});
const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Atlas ket noi thanh cong!");
  } catch (error) {
    console.error(
      "Loi ket noi MongoDB:",
      error.message
    );

    throw error;
  }
}

module.exports = connectDB;
