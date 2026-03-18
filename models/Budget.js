const mongoose = require("mongoose");

// One budget document per user — stores monthly limits per category
const budgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one budget doc per user
    },
    limits: {
      // category -> amount map, e.g. { food: 5000, transport: 2000 }
      food:          { type: Number, default: 0, min: 0 },
      transport:     { type: Number, default: 0, min: 0 },
      shopping:      { type: Number, default: 0, min: 0 },
      entertainment: { type: Number, default: 0, min: 0 },
      health:        { type: Number, default: 0, min: 0 },
      utilities:     { type: Number, default: 0, min: 0 },
      education:     { type: Number, default: 0, min: 0 },
      travel:        { type: Number, default: 0, min: 0 },
      personal:      { type: Number, default: 0, min: 0 },
      home:          { type: Number, default: 0, min: 0 },
      savings:       { type: Number, default: 0, min: 0 },
      other:         { type: Number, default: 0, min: 0 },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Budget", budgetSchema);
