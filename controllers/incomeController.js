const Income = require("../models/Income");
const { asyncHandler } = require("../middleware/errorHandler");
const { getPeriodRange } = require("../utils/dateHelpers");

// ── GET /api/income ────────────────────────────────────────────
const getIncome = asyncHandler(async (req, res) => {
  const { period, from, to, category, page = 1, limit = 100, sort = "-date" } = req.query;

  const filter = { user: req.user._id };

  if (period) {
    const { start, end } = getPeriodRange(period);
    filter.date = { $gte: start, $lte: end };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to)   filter.date.$lte = to;
  }

  if (category) filter.category = category;

  const pageNum  = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 500);
  const skip     = (pageNum - 1) * limitNum;

  const sortMap = {
    date: { date: 1 }, "-date": { date: -1 },
    amount: { amount: 1 }, "-amount": { amount: -1 },
  };
  const sortQuery = sortMap[sort] || { date: -1 };

  const [income, total] = await Promise.all([
    Income.find(filter).sort(sortQuery).skip(skip).limit(limitNum).lean(),
    Income.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: income,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ── GET /api/income/:id ────────────────────────────────────────
const getIncomeById = asyncHandler(async (req, res) => {
  const item = await Income.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: "Income record not found" });
  res.json({ success: true, data: item });
});

// ── POST /api/income ───────────────────────────────────────────
const createIncome = asyncHandler(async (req, res) => {
  const { amount, description, category, date, note } = req.body;
  const item = await Income.create({
    user: req.user._id,
    amount,
    description,
    category,
    date,
    note: note || "",
  });
  res.status(201).json({ success: true, data: item });
});

// ── PUT /api/income/:id ────────────────────────────────────────
const updateIncome = asyncHandler(async (req, res) => {
  const { amount, description, category, date, note } = req.body;
  const item = await Income.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { amount, description, category, date, note },
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ success: false, message: "Income record not found" });
  res.json({ success: true, data: item });
});

// ── DELETE /api/income/:id ─────────────────────────────────────
const deleteIncome = asyncHandler(async (req, res) => {
  const item = await Income.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: "Income record not found" });
  res.json({ success: true, message: "Income record deleted", id: req.params.id });
});

// ── GET /api/income/summary ────────────────────────────────────
const getIncomeSummary = asyncHandler(async (req, res) => {
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
    Income.aggregate([
      { $match: matchStage },
      { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Income.aggregate([
      { $match: matchStage },
      { $group: { _id: "$date", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]),
    Income.aggregate([
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

module.exports = { getIncome, getIncomeById, createIncome, updateIncome, deleteIncome, getIncomeSummary };
