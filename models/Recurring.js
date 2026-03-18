const mongoose = require("mongoose");

const recurringSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    category: {
      type: String,
      required: true,
      enum: ["food","transport","shopping","entertainment","health",
             "utilities","education","travel","personal","home","savings","other"],
      default: "other",
    },
    frequency: {
      type: String,
      required: [true, "Frequency is required"],
      enum: { values: ["daily", "weekly", "monthly", "yearly"], message: "Invalid frequency" },
    },
    startDate: {
      type: String,
      required: [true, "Start date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note cannot exceed 500 characters"],
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastAppliedDate: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Recurring", recurringSchema);
