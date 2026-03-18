const express = require("express");
const router = express.Router();
const {
  getIncome, getIncomeById, createIncome,
  updateIncome, deleteIncome, getIncomeSummary,
} = require("../controllers/incomeController");
const { protect } = require("../middleware/auth");
const {
  incomeValidator, dateRangeValidator, mongoIdValidator,
} = require("../middleware/validators");

router.use(protect);

router.get("/summary", dateRangeValidator, getIncomeSummary);
router.get("/",        dateRangeValidator, getIncome);
router.post("/",       incomeValidator,    createIncome);

router.get("/:id",    mongoIdValidator, getIncomeById);
router.put("/:id",    mongoIdValidator, incomeValidator, updateIncome);
router.delete("/:id", mongoIdValidator, deleteIncome);

module.exports = router;
