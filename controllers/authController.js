const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Budget = require("../models/Budget");
const { asyncHandler } = require("../middleware/errorHandler");

// ── Token helpers ──────────────────────────────────────────────
const signAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE });

const sendTokenResponse = async (user, statusCode, res) => {
  const accessToken  = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Persist refresh token (hashed would be even better, kept simple here)
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: user.toPublicJSON(),
  });
};

// ── POST /api/auth/register ────────────────────────────────────
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ success: false, message: "Email already registered" });
  }

  const user = await User.create({ name, email, password });

  // Create an empty budget document for the new user
  await Budget.create({ user: user._id });

  await sendTokenResponse(user, 201, res);
});

// ── POST /api/auth/login ───────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  if (!user.isActive) {
    return res.status(401).json({ success: false, message: "Account deactivated" });
  }

  await sendTokenResponse(user, 200, res);
});

// ── POST /api/auth/refresh ─────────────────────────────────────
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) {
    return res.status(401).json({ success: false, message: "Refresh token required" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
  }

  const user = await User.findById(decoded.id).select("+refreshToken");
  if (!user || user.refreshToken !== token) {
    return res.status(401).json({ success: false, message: "Refresh token revoked" });
  }

  const newAccessToken  = signAccessToken(user._id);
  const newRefreshToken = signRefreshToken(user._id);
  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// ── POST /api/auth/logout ──────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  res.json({ success: true, message: "Logged out successfully" });
});

// ── GET /api/auth/me ───────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user: user.toPublicJSON() });
});

// ── PUT /api/auth/profile ──────────────────────────────────────
const updateProfile = asyncHandler(async (req, res) => {
  const { name, settings } = req.body;
  const updates = {};
  if (name)     updates.name = name.trim();
  if (settings) updates.settings = { ...req.user.settings, ...settings };

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true, runValidators: true,
  });
  res.json({ success: true, user: user.toPublicJSON() });
});

// ── PUT /api/auth/change-password ─────────────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "Both passwords required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
  }

  const user = await User.findById(req.user._id).select("+password");
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: "Current password is incorrect" });
  }

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: "Password changed successfully" });
});

module.exports = { register, login, refreshToken, logout, getMe, updateProfile, changePassword };
