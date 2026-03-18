const mongoose = require("mongoose");

const EXPENSE_CATEGORIES = [
  "food", "transport", "shopping", "entertainment", "health",
  "utilities", "education", "travel", "personal", "home", "savings", "other",
];

const expenseSchema = new mongoose.Schema(
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
      required: [true, "Category is required"],
      enum: { values: EXPENSE_CATEGORIES, message: "Invalid category" },
      default: "other",
    },
    date: {
      type: String, // stored as YYYY-MM-DD for easy filtering/grouping
      required: [true, "Date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note cannot exceed 500 characters"],
      default: "",
    },
    recurringId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recurring",
      default: null,
    },
    tags: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user+date queries
expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ user: 1, category: 1, date: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
