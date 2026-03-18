const express = require("express");
const router = express.Router();
const {
  getRecurring, getRecurringById, createRecurring,
  updateRecurring, deleteRecurring, applyRecurring, applyDueRecurring,
} = require("../controllers/recurringController");
const { protect } = require("../middleware/auth");
const { recurringValidator, mongoIdValidator } = require("../middleware/validators");

router.use(protect);

router.get("/",           getRecurring);
router.post("/",          recurringValidator, createRecurring);
router.post("/apply-due", applyDueRecurring);

router.get("/:id",          mongoIdValidator, getRecurringById);
router.put("/:id",          mongoIdValidator, recurringValidator, updateRecurring);
router.delete("/:id",       mongoIdValidator, deleteRecurring);
router.post("/:id/apply",   mongoIdValidator, applyRecurring);

module.exports = router;
