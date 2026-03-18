const Expense = require("../models/Expense");
const { asyncHandler } = require("../middleware/errorHandler");
const { getPeriodRange } = require("../utils/dateHelpers");

// ── GET /api/expenses ──────────────────────────────────────────
// Supports: ?period=month|week|day|year  ?from=YYYY-MM-DD&to=YYYY-MM-DD
//           ?category=food  ?page=1  ?limit=50  ?sort=date|-date|amount|-amount
const getExpenses = asyncHandler(async (req, res) => {
  const { period, from, to, category, page = 1, limit = 100, sort = "-date" } = req.query;

  const filter = { user: req.user._id };

  // Date range
  if (period) {
    const { start, end } = getPeriodRange(period);
    filter.date = { $gte: start, $lte: end };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to)   filter.date.$lte = to;
  }

  // Category filter
  if (category) filter.category = category;

  const pageNum  = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 500);
  const skip     = (pageNum - 1) * limitNum;

  // Allowed sort fields
  const sortMap = {
    date: { date: 1 },  "-date": { date: -1 },
    amount: { amount: 1 }, "-amount": { amount: -1 },
    createdAt: { createdAt: 1 }, "-createdAt": { createdAt: -1 },
  };
  const sortQuery = sortMap[sort] || { date: -1 };

  const [expenses, total] = await Promise.all([
    Expense.find(filter).sort(sortQuery).skip(skip).limit(limitNum).lean(),
    Expense.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: expenses,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

// ── GET /api/expenses/:id ──────────────────────────────────────
const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, user: req.user._id });
  if (!expense) {
    return res.status(404).json({ success: false, message: "Expense not found" });
  }
  res.json({ success: true, data: expense });
});

// ── POST /api/expenses ─────────────────────────────────────────
const createExpense = asyncHandler(async (req, res) => {
  const { amount, description, category, date, note, tags, recurringId } = req.body;
  const expense = await Expense.create({
    user: req.user._id,
    amount,
    description,
    category,
    date,
    note: note || "",
    tags: tags || [],
    recurringId: recurringId || null,
  });
  res.status(201).json({ success: true, data: expense });
});

// ── PUT /api/expenses/:id ──────────────────────────────────────
const updateExpense = asyncHandler(async (req, res) => {
  const { amount, description, category, date, note, tags } = req.body;

  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { amount, description, category, date, note, tags },
    { new: true, runValidators: true }
  );

  if (!expense) {
    return res.status(404).json({ success: false, message: "Expense not found" });
  }
  res.json({ success: true, data: expense });
});

// ── DELETE /api/expenses/:id ───────────────────────────────────
const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!expense) {
    return res.status(404).json({ success: false, message: "Expense not found" });
  }
  res.json({ success: true, message: "Expense deleted", id: req.params.id });
});

// ── DELETE /api/expenses (bulk delete) ────────────────────────
const bulkDeleteExpenses = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: "ids array required" });
  }
  const result = await Expense.deleteMany({ _id: { $in: ids }, user: req.user._id });
  res.json({ success: true, message: `${result.deletedCount} expenses deleted` });
});

// ── GET /api/expenses/summary ──────────────────────────────────
// Returns aggregated totals per category + daily breakdown
const getSummary = asyncHandler(async (req, res) => {
  const { period, from, to } = req.query;

  let dateFilter = {};
  if (period) {
    const { start, end } = getPeriodRange(period);
    dateFilter = { $gte: start, $lte: end };
  } else if (from || to) {
    if (from) dateFilter.$gte = from;
    if (to)   dateFilter.$lte = to;
  }

  const matchStage = { user: req.user._id };
  if (Object.keys(dateFilter).length) matchStage.date = dateFilter;

  const [byCategory, byDate, totals] = await Promise.all([
    // Category breakdown
    Expense.aggregate([
      { $match: matchStage },
      { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),

    // Daily breakdown
    Expense.aggregate([
      { $match: matchStage },
      { $group: { _id: "$date", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]),

    // Overall totals
    Expense.aggregate([
      { $match: matchStage },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 }, avg: { $avg: "$amount" }, max: { $max: "$amount" } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      byCategory: byCategory.map((c) => ({ category: c._id, total: c.total, count: c.count })),
      byDate: byDate.map((d) => ({ date: d._id, total: d.total, count: d.count })),
      totals: totals[0] || { total: 0, count: 0, avg: 0, max: 0 },
    },
  });
});

module.exports = {
  getExpenses, getExpense, createExpense, updateExpense,
  deleteExpense, bulkDeleteExpenses, getSummary,
};
