const Budget = require("../models/Budget");
const Expense = require("../models/Expense");
const { asyncHandler } = require("../middleware/errorHandler");
const { getPeriodRange } = require("../utils/dateHelpers");

// ── GET /api/budget ────────────────────────────────────────────
// Returns the budget limits + current month's spending per category
const getBudget = asyncHandler(async (req, res) => {
  // Find or create budget doc
  let budget = await Budget.findOne({ user: req.user._id });
  if (!budget) {
    budget = await Budget.create({ user: req.user._id });
  }

  // Get current month spending per category
  const { start, end } = getPeriodRange("month");
  const spending = await Expense.aggregate([
    { $match: { user: req.user._id, date: { $gte: start, $lte: end } } },
    { $group: { _id: "$category", spent: { $sum: "$amount" } } },
  ]);

  const spendMap = {};
  spending.forEach((s) => { spendMap[s._id] = s.spent; });

  // Build response merging limits + spent
  const categories = Object.keys(budget.limits.toObject());
  const overview = categories.map((cat) => ({
    category: cat,
    limit: budget.limits[cat] || 0,
    spent: spendMap[cat] || 0,
    remaining: Math.max(0, (budget.limits[cat] || 0) - (spendMap[cat] || 0)),
    percentUsed: budget.limits[cat] > 0
      ? Math.min(100, ((spendMap[cat] || 0) / budget.limits[cat]) * 100)
      : 0,
    isOver: (spendMap[cat] || 0) > (budget.limits[cat] || 0) && budget.limits[cat] > 0,
  }));

  res.json({
    success: true,
    data: {
      _id: budget._id,
      limits: budget.limits,
      overview,
      updatedAt: budget.updatedAt,
    },
  });
});

// ── PUT /api/budget ────────────────────────────────────────────
// Upsert budget limits — body: { limits: { food: 5000, transport: 2000, ... } }
const updateBudget = asyncHandler(async (req, res) => {
  const { limits } = req.body;

  // Sanitise: only accept known categories, coerce to numbers
  const VALID_CATS = ["food","transport","shopping","entertainment","health",
                      "utilities","education","travel","personal","home","savings","other"];
  const sanitised = {};
  VALID_CATS.forEach((cat) => {
    if (limits[cat] !== undefined) sanitised[`limits.${cat}`] = Math.max(0, Number(limits[cat]) || 0);
  });

  const budget = await Budget.findOneAndUpdate(
    { user: req.user._id },
    { $set: sanitised },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: budget });
});

// ── DELETE /api/budget ─────────────────────────────────────────
// Reset all budget limits to zero
const resetBudget = asyncHandler(async (req, res) => {
  const budget = await Budget.findOneAndUpdate(
    { user: req.user._id },
    {
      $set: {
        "limits.food": 0, "limits.transport": 0, "limits.shopping": 0,
        "limits.entertainment": 0, "limits.health": 0, "limits.utilities": 0,
        "limits.education": 0, "limits.travel": 0, "limits.personal": 0,
        "limits.home": 0, "limits.savings": 0, "limits.other": 0,
      },
    },
    { new: true }
  );
  res.json({ success: true, message: "Budget reset", data: budget });
});

module.exports = { getBudget, updateBudget, resetBudget };
