const Recurring = require("../models/Recurring");
const Expense = require("../models/Expense");
const { asyncHandler } = require("../middleware/errorHandler");

// ── GET /api/recurring ─────────────────────────────────────────
const getRecurring = asyncHandler(async (req, res) => {
  const items = await Recurring.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: items });
});

// ── GET /api/recurring/:id ─────────────────────────────────────
const getRecurringById = asyncHandler(async (req, res) => {
  const item = await Recurring.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: "Recurring item not found" });
  res.json({ success: true, data: item });
});

// ── POST /api/recurring ────────────────────────────────────────
const createRecurring = asyncHandler(async (req, res) => {
  const { amount, description, category, frequency, startDate, note } = req.body;
  const item = await Recurring.create({
    user: req.user._id,
    amount,
    description,
    category,
    frequency,
    startDate,
    note: note || "",
  });
  res.status(201).json({ success: true, data: item });
});

// ── PUT /api/recurring/:id ─────────────────────────────────────
const updateRecurring = asyncHandler(async (req, res) => {
  const { amount, description, category, frequency, startDate, note, isActive } = req.body;
  const item = await Recurring.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { amount, description, category, frequency, startDate, note, isActive },
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ success: false, message: "Recurring item not found" });
  res.json({ success: true, data: item });
});

// ── DELETE /api/recurring/:id ──────────────────────────────────
const deleteRecurring = asyncHandler(async (req, res) => {
  const item = await Recurring.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: "Recurring item not found" });
  res.json({ success: true, message: "Recurring item deleted", id: req.params.id });
});

// ── POST /api/recurring/:id/apply ─────────────────────────────
// Instantly log a recurring item as a one-time expense for today
const applyRecurring = asyncHandler(async (req, res) => {
  const item = await Recurring.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: "Recurring item not found" });

  const today = new Date().toISOString().split("T")[0];

  const expense = await Expense.create({
    user: req.user._id,
    amount: item.amount,
    description: item.description,
    category: item.category,
    date: today,
    note: `Auto-applied: ${item.frequency} recurring`,
    recurringId: item._id,
  });

  // Update lastAppliedDate
  item.lastAppliedDate = today;
  await item.save();

  res.status(201).json({
    success: true,
    message: "Recurring expense logged",
    data: { expense, recurring: item },
  });
});

// ── POST /api/recurring/apply-due ─────────────────────────────
// Auto-apply all overdue recurring items (useful for a cron job)
const applyDueRecurring = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const allRecurring = await Recurring.find({ user: req.user._id, isActive: true });

  const applied = [];

  for (const item of allRecurring) {
    const isDue = isRecurringDue(item, today);
    if (!isDue) continue;

    const expense = await Expense.create({
      user: req.user._id,
      amount: item.amount,
      description: item.description,
      category: item.category,
      date: today,
      note: `Auto-applied: ${item.frequency} recurring`,
      recurringId: item._id,
    });

    item.lastAppliedDate = today;
    await item.save();
    applied.push({ recurring: item.description, expense: expense._id });
  }

  res.json({
    success: true,
    message: `${applied.length} recurring item(s) applied`,
    data: applied,
  });
});

// Helper: check if a recurring item is due today
function isRecurringDue(item, today) {
  const last = item.lastAppliedDate;
  if (!last) return true; // never applied

  const lastDate = new Date(last);
  const todayDate = new Date(today);
  const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

  switch (item.frequency) {
    case "daily":   return diffDays >= 1;
    case "weekly":  return diffDays >= 7;
    case "monthly": return diffDays >= 28;
    case "yearly":  return diffDays >= 365;
    default:        return false;
  }
}

module.exports = {
  getRecurring, getRecurringById, createRecurring,
  updateRecurring, deleteRecurring, applyRecurring, applyDueRecurring,
};
