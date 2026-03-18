const express = require("express");
const router = express.Router();
const {
  getOverview, getMonthlyTrend, getWeeklyTrend,
  getDailyTrend, getCategoryBreakdown, getInsights, getCashflow,
} = require("../controllers/analyticsController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/overview",    getOverview);
router.get("/monthly",     getMonthlyTrend);
router.get("/weekly",      getWeeklyTrend);
router.get("/daily",       getDailyTrend);
router.get("/categories",  getCategoryBreakdown);
router.get("/insights",    getInsights);
router.get("/cashflow",    getCashflow);

module.exports = router;
