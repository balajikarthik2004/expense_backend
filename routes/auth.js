const express = require("express");
const router = express.Router();
const {
  register, login, refreshToken, logout,
  getMe, updateProfile, changePassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { registerValidator, loginValidator } = require("../middleware/validators");

// Public
router.post("/register", registerValidator, register);
router.post("/login",    loginValidator,    login);
router.post("/refresh",  refreshToken);

// Protected
router.use(protect);
router.post("/logout",          logout);
router.get("/me",               getMe);
router.put("/profile",          updateProfile);
router.put("/change-password",  changePassword);

module.exports = router;
