const UserSettings = require("../models/UserSettings");
const asyncHandler = require("../middleware/async");

// @desc    Get current user settings
// @route   GET /api/auth/settings
// @access  Private
exports.getSettings = asyncHandler(async (req, res, next) => {
  let settings = await UserSettings.findOne({ userId: req.user.id });

  if (!settings) {
    // Create default settings if not exists
    settings = await UserSettings.create({
      userId: req.user.id,
      notifications: {}, // Will use defaults from schema
      display: {},
      general: {},
    });
  }

  res.status(200).json({
    success: true,
    data: settings,
  });
});

// @desc    Update user settings
// @route   PUT /api/auth/settings
// @access  Private
exports.updateSettings = asyncHandler(async (req, res, next) => {
  let settings = await UserSettings.findOne({ userId: req.user.id });

  if (!settings) {
    settings = await UserSettings.create({ userId: req.user.id });
  }

  // Helper to merge deep objects safely
  const mergeDeep = (target, source) => {
    if (!source) return target;
    for (const key in source) {
      if (source[key] instanceof Object && key in target) {
        Object.assign(source[key], mergeDeep(target[key], source[key]));
      }
    }
    Object.assign(target || {}, source);
    return target;
  };

  // Update logic:
  // We can manually update specific sections to ensure structure integrity
  if (req.body.notifications) {
    if (!settings.notifications) settings.notifications = {};

    if (req.body.notifications.email) {
      settings.notifications.email = {
        ...settings.notifications.email,
        ...req.body.notifications.email,
      };
    }
    if (req.body.notifications.inApp) {
      settings.notifications.inApp = {
        ...settings.notifications.inApp,
        ...req.body.notifications.inApp,
      };
    }
  }

  if (req.body.display) {
    settings.display = { ...settings.display, ...req.body.display };
  }

  if (req.body.general) {
    settings.general = { ...settings.general, ...req.body.general };
  }

  await settings.save();

  res.status(200).json({
    success: true,
    data: settings,
  });
});
