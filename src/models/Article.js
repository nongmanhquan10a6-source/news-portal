
const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    summary: {
      type: String,
      default: ""
    },
    content: {
      type: String,
      required: true
    },
    imageUrl: {
      type: String,
      default: ""
    },
    sourceUrl: {
  type: String,
  default: ""
},
    category: {
      type: String,
      default: "Tin mới"
    },
    author: {
      type: String,
      default: "Ban biên tập"
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft"
    },
    publishedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

const Article = mongoose.model("Article", articleSchema);

module.exports = Article;
