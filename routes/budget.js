const express = require("express");
const router = express.Router();
const { getBudget, updateBudget, resetBudget } = require("../controllers/budgetController");
const { protect } = require("../middleware/auth");
const { budgetValidator } = require("../middleware/validators");

router.use(protect);

router.get("/",    getBudget);
router.put("/",    budgetValidator, updateBudget);
router.delete("/", resetBudget);

module.exports = router;
