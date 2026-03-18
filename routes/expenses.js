const express = require("express");
const router = express.Router();
const {
  getExpenses, getExpense, createExpense,
  updateExpense, deleteExpense, bulkDeleteExpenses, getSummary,
} = require("../controllers/expenseController");
const { protect } = require("../middleware/auth");
const {
  expenseValidator, dateRangeValidator, mongoIdValidator,
} = require("../middleware/validators");

router.use(protect); // All expense routes require auth

router.get("/summary", dateRangeValidator, getSummary);
router.get("/",        dateRangeValidator, getExpenses);
router.post("/",       expenseValidator,   createExpense);
router.delete("/bulk", bulkDeleteExpenses);

router.get("/:id",    mongoIdValidator, getExpense);
router.put("/:id",    mongoIdValidator, expenseValidator, updateExpense);
router.delete("/:id", mongoIdValidator, deleteExpense);

module.exports = router;
