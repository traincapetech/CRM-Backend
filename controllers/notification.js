const Notification = require("../models/Notification");
const NotificationSubscription = require("../models/NotificationSubscription");

// 1. Get all notifications for a user (paginated)
exports.getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { recipient: req.user._id };
    if (req.query.isRead !== undefined) {
      filter.isRead = req.query.isRead === "true";
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("ticketId", "title status");

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
      unreadCount,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error getting notifications:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 2. Mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // 🔑 Notify client via socket for real-time sync across tabs
    const io = req.app.get("io");
    if (io) {
      io.to(`user-${req.user._id}`).emit("notification_updated", {
        id: req.params.id,
        isRead: true,
      });
      io.to(`user-${req.user._id}`).emit("notification_count_update");
    }

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 3. Mark all notifications as read for a user
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    // 🔑 Notify client via socket for real-time sync across tabs
    const io = req.app.get("io");
    if (io) {
      io.to(`user-${req.user._id}`).emit("notification_updated", { allRead: true });
      io.to(`user-${req.user._id}`).emit("notification_count_update");
    }

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 4. Delete a notification
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // 🔑 Notify client via socket for real-time sync across tabs
    const io = req.app.get("io");
    if (io) {
      io.to(`user-${req.user._id}`).emit("notification_count_update");
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 5. Subscribe to Web Push
exports.subscribe = async (req, res) => {
  try {
    const { subscription, deviceType } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription object",
      });
    }

    const NotificationSubscription = require("../models/NotificationSubscription");

    // Upsert subscription
    await NotificationSubscription.findOneAndUpdate(
      { "subscription.endpoint": subscription.endpoint },
      {
        user: req.user._id,
        subscription,
        deviceType: deviceType || "browser",
      },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      success: true,
      message: "Successfully subscribed to push notifications",
    });
  } catch (error) {
    console.error("Error subscribing to push notifications:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
