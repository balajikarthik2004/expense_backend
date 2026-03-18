const Expense = require("../models/Expense");
const Income = require("../models/Income");
const { asyncHandler } = require("../middleware/errorHandler");
const { getPeriodRange, getMonthPrefix } = require("../utils/dateHelpers");

// ── GET /api/analytics/overview ───────────────────────────────
// Dashboard overview: today/week/month/year totals for both expense & income
const getOverview = asyncHandler(async (req, res) => {
  const periods = ["day", "week", "month", "year"];
  const result = {};

  await Promise.all(
    periods.map(async (period) => {
      const { start, end } = getPeriodRange(period);
      const matchStage = { date: { $gte: start, $lte: end } };

      const [expTotals, incTotals] = await Promise.all([
        Expense.aggregate([
          { $match: { user: req.user._id, ...matchStage } },
          { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
        Income.aggregate([
          { $match: { user: req.user._id, ...matchStage } },
          { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
      ]);

      const expenses = expTotals[0] || { total: 0, count: 0 };
      const income   = incTotals[0] || { total: 0, count: 0 };

      result[period] = {
        expenses: { total: expenses.total, count: expenses.count },
        income:   { total: income.total,   count: income.count },
        net: income.total - expenses.total,
      };
    })
  );

  res.json({ success: true, data: result });
});

// ── GET /api/analytics/monthly ────────────────────────────────
// Last 12 months of expenses + income for line/bar charts
const getMonthlyTrend = asyncHandler(async (req, res) => {
  const months = 12;
  const now = new Date();
  const labels = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(getMonthPrefix(d));
  }

  const firstMonth = labels[0];
  const lastMonth  = labels[labels.length - 1];

  const [expAgg, incAgg] = await Promise.all([
    Expense.aggregate([
      {
        $match: {
          user: req.user._id,
          $expr: {
            $and: [
              { $gte: [{ $substr: ["$date", 0, 7] }, firstMonth] },
              { $lte: [{ $substr: ["$date", 0, 7] }, lastMonth] },
            ],
          },
        },
      },
      {
        $group: {
          _id: { $substr: ["$date", 0, 7] },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Income.aggregate([
      {
        $match: {
          user: req.user._id,
          $expr: {
            $and: [
              { $gte: [{ $substr: ["$date", 0, 7] }, firstMonth] },
              { $lte: [{ $substr: ["$date", 0, 7] }, lastMonth] },
            ],
          },
        },
      },
      {
        $group: {
          _id: { $substr: ["$date", 0, 7] },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const expMap = {};
  expAgg.forEach((e) => { expMap[e._id] = e; });
  const incMap = {};
  incAgg.forEach((e) => { incMap[e._id] = e; });

  const data = labels.map((month) => ({
    month,
    expenses: expMap[month]?.total || 0,
    expenseCount: expMap[month]?.count || 0,
    income: incMap[month]?.total || 0,
    incomeCount: incMap[month]?.count || 0,
    savings: (incMap[month]?.total || 0) - (expMap[month]?.total || 0),
  }));

  res.json({ success: true, data });
});

// ── GET /api/analytics/weekly ─────────────────────────────────
// Last N weeks of expenses
const getWeeklyTrend = asyncHandler(async (req, res) => {
  const weeksBack = parseInt(req.query.weeks) || 8;
  const now = new Date();
  const data = [];

  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const ws = weekStart.toISOString().split("T")[0];
    const we = weekEnd.toISOString().split("T")[0];

    const [expAgg, incAgg] = await Promise.all([
      Expense.aggregate([
        { $match: { user: req.user._id, date: { $gte: ws, $lte: we } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      Income.aggregate([
        { $match: { user: req.user._id, date: { $gte: ws, $lte: we } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    data.push({
      weekStart: ws,
      weekEnd: we,
      label: `W${weeksBack - i}`,
      expenses: expAgg[0]?.total || 0,
      expenseCount: expAgg[0]?.count || 0,
      income: incAgg[0]?.total || 0,
    });
  }

  res.json({ success: true, data });
});

// ── GET /api/analytics/daily ───────────────────────────────────
// Last N days breakdown
const getDailyTrend = asyncHandler(async (req, res) => {
  const daysBack = parseInt(req.query.days) || 30;
  const data = [];
  const now = new Date();

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];

    const agg = await Expense.aggregate([
      { $match: { user: req.user._id, date: dateStr } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    data.push({ date: dateStr, total: agg[0]?.total || 0, count: agg[0]?.count || 0 });
  }

  res.json({ success: true, data });
});

// ── GET /api/analytics/categories ─────────────────────────────
// Category breakdown with optional period filter
const getCategoryBreakdown = asyncHandler(async (req, res) => {
  const { period, from, to } = req.query;
  const matchStage = { user: req.user._id };

  if (period) {
    const { start, end } = getPeriodRange(period);
    matchStage.date = { $gte: start, $lte: end };
  } else if (from || to) {
    matchStage.date = {};
    if (from) matchStage.date.$gte = from;
    if (to)   matchStage.date.$lte = to;
  }

  const breakdown = await Expense.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$category",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
        avgAmount: { $avg: "$amount" },
        maxAmount: { $max: "$amount" },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const grandTotal = breakdown.reduce((s, c) => s + c.total, 0);

  const data = breakdown.map((c) => ({
    category: c._id,
    total: c.total,
    count: c.count,
    avgAmount: Math.round(c.avgAmount * 100) / 100,
    maxAmount: c.maxAmount,
    percentage: grandTotal > 0 ? Math.round((c.total / grandTotal) * 10000) / 100 : 0,
  }));

  res.json({ success: true, data, grandTotal });
});

// ── GET /api/analytics/insights ───────────────────────────────
// Computed insight cards: streak, daily avg, largest, month-over-month change
const getInsights = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  // This month vs last month
  const { start: thisStart, end: thisEnd } = getPeriodRange("month");
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastStart = getMonthPrefix(lastMonthDate) + "-01";
  const lastEnd = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() + 1, 0)
    .toISOString().split("T")[0];

  const [thisTotals, lastTotals, largestExp, allDates] = await Promise.all([
    Expense.aggregate([
      { $match: { user: req.user._id, date: { $gte: thisStart, $lte: thisEnd } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: { user: req.user._id, date: { $gte: lastStart, $lte: lastEnd } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Expense.findOne({ user: req.user._id }).sort({ amount: -1 }).lean(),
    Expense.distinct("date", { user: req.user._id }),
  ]);

  // Logging streak
  const dateSet = new Set(allDates);
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = d.toISOString().split("T")[0];
    if (dateSet.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }

  const thisMonthTotal = thisTotals[0]?.total || 0;
  const lastMonthTotal = lastTotals[0]?.total || 0;
  const monthChange = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : 0;

  const thisMonthCount = thisTotals[0]?.count || 0;
  const daysInMonth = new Date().getDate();
  const dailyAvg = thisMonthCount > 0 ? thisMonthTotal / daysInMonth : 0;

  res.json({
    success: true,
    data: {
      streak,
      monthChange: Math.round(monthChange * 100) / 100,
      thisMonthTotal,
      lastMonthTotal,
      dailyAvg: Math.round(dailyAvg * 100) / 100,
      largestExpense: largestExp
        ? { amount: largestExp.amount, description: largestExp.description, date: largestExp.date }
        : null,
    },
  });
});

// ── GET /api/analytics/cashflow ────────────────────────────────
// Last 6 months income vs expenses cashflow summary
const getCashflow = asyncHandler(async (req, res) => {
  const monthsBack = parseInt(req.query.months) || 6;
  const now = new Date();
  const data = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = getMonthPrefix(d);

    const [expAgg, incAgg] = await Promise.all([
      Expense.aggregate([
        {
          $match: {
            user: req.user._id,
            $expr: { $eq: [{ $substr: ["$date", 0, 7] }, prefix] },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Income.aggregate([
        {
          $match: {
            user: req.user._id,
            $expr: { $eq: [{ $substr: ["$date", 0, 7] }, prefix] },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const expenses = expAgg[0]?.total || 0;
    const income   = incAgg[0]?.total || 0;

    data.push({
      month: prefix,
      expenses,
      income,
      savings: income - expenses,
      savingsRate: income > 0 ? Math.round(((income - expenses) / income) * 10000) / 100 : 0,
    });
  }

  res.json({ success: true, data });
});

module.exports = {
  getOverview, getMonthlyTrend, getWeeklyTrend,
  getDailyTrend, getCategoryBreakdown, getInsights, getCashflow,
};
