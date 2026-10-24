const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: "Article", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null, index: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

commentSchema.index({ article: 1, createdAt: 1 });
module.exports = mongoose.model("Comment", commentSchema);
