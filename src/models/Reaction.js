const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema({
  comment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["like", "haha", "sad", "love", "angry"], required: true }
}, { timestamps: true });

// One current reaction per member per comment; a later choice replaces it.
reactionSchema.index({ comment: 1, user: 1 }, { unique: true });
module.exports = mongoose.model("Reaction", reactionSchema);
