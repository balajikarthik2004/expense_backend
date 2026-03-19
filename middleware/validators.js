const { body, query, param, validationResult } = require("express-validator");

// Run validators and return 422 if any fail
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Auth validators ────────────────────────────────────────────
const registerValidator = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 50 }),
  body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password")
    .isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
    .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
    .withMessage("Password must include at least one letter and one number"),
  validate,
];

const loginValidator = [
  body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  validate,
];

// ── Expense validators ─────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  "food","transport","shopping","entertainment","health",
  "utilities","education","travel","personal","home","savings","other",
];

const expenseValidator = [
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("Amount must be a positive number"),
  body("description")
    .trim()
    .notEmpty().withMessage("Description is required")
    .isLength({ max: 200 }).withMessage("Description max 200 chars"),
  body("category")
    .isIn(EXPENSE_CATEGORIES).withMessage("Invalid category"),
  body("date")
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Date must be YYYY-MM-DD"),
  body("note")
    .optional()
    .isLength({ max: 500 }).withMessage("Note max 500 chars"),
  validate,
];

// ── Income validators ──────────────────────────────────────────
const INCOME_CATEGORIES = ["salary","freelance","business","investment","gift","rental","other_inc"];

const incomeValidator = [
  body("amount").isFloat({ min: 0.01 }).withMessage("Amount must be a positive number"),
  body("description").trim().notEmpty().withMessage("Description is required").isLength({ max: 200 }),
  body("category").isIn(INCOME_CATEGORIES).withMessage("Invalid income category"),
  body("date").matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Date must be YYYY-MM-DD"),
  body("note").optional().isLength({ max: 500 }),
  validate,
];

// ── Budget validator ───────────────────────────────────────────
const budgetValidator = [
  body("limits").isObject().withMessage("Limits must be an object"),
  body("limits.*")
    .optional()
    .isFloat({ min: 0 }).withMessage("Budget amounts must be non-negative numbers"),
  validate,
];

// ── Recurring validator ────────────────────────────────────────
const recurringValidator = [
  body("amount").isFloat({ min: 0.01 }).withMessage("Amount must be a positive number"),
  body("description").trim().notEmpty().withMessage("Description is required").isLength({ max: 200 }),
  body("category").isIn(EXPENSE_CATEGORIES).withMessage("Invalid category"),
  body("frequency").isIn(["daily","weekly","monthly","yearly"]).withMessage("Invalid frequency"),
  body("startDate").matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Start date must be YYYY-MM-DD"),
  body("note").optional().isLength({ max: 500 }),
  validate,
];

// ── Query validators ───────────────────────────────────────────
const dateRangeValidator = [
  query("from").optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("from must be YYYY-MM-DD"),
  query("to").optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("to must be YYYY-MM-DD"),
  query("period").optional().isIn(["day","week","month","year"]).withMessage("Invalid period"),
  query("category").optional(),
  query("limit").optional().isInt({ min: 1, max: 500 }),
  query("page").optional().isInt({ min: 1 }),
  validate,
];

const mongoIdValidator = [
  param("id").isMongoId().withMessage("Invalid ID format"),
  validate,
];

module.exports = {
  registerValidator,
  loginValidator,
  expenseValidator,
  incomeValidator,
  budgetValidator,
  recurringValidator,
  dateRangeValidator,
  mongoIdValidator,
};
