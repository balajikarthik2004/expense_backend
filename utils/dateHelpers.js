/**
 * Returns { start, end } date strings (YYYY-MM-DD) for a named period
 */
const getPeriodRange = (period) => {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  switch (period) {
    case "day":
      return { start: todayStr, end: todayStr };

    case "week": {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      return {
        start: weekStart.toISOString().split("T")[0],
        end: todayStr,
      };
    }

    case "month": {
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      return { start: monthStart, end: todayStr };
    }

    case "year": {
      const yearStart = `${now.getFullYear()}-01-01`;
      return { start: yearStart, end: todayStr };
    }

    default:
      return { start: todayStr, end: todayStr };
  }
};

/**
 * Returns "YYYY-MM" prefix for a given Date object
 */
const getMonthPrefix = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/**
 * Returns "YYYY-MM-DD" string for today
 */
const todayString = () => new Date().toISOString().split("T")[0];

module.exports = { getPeriodRange, getMonthPrefix, todayString };
