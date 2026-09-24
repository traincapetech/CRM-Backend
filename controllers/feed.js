const FeedService = require("../services/feedService");

// @desc    Get user's feed
// @route   GET /api/feed
// @access  Private
exports.getFeed = async (req, res) => {
  try {
    const { limit, offset, includeActioned } = req.query;

    const feed = await FeedService.getUserFeed(req.user._id, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
      includeActioned: includeActioned === "true",
      targetId: req.query.targetId,
    });

    res.status(200).json({
      success: true,
      count: feed.length,
      data: feed,
    });
  } catch (error) {
    console.error("Get Feed Error:", error);
    res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};

// @desc    Mark item as actioned
// @route   PUT /api/feed/:id/actioned
// @access  Private
exports.markActioned = async (req, res) => {
  try {
    const item = await FeedService.markActioned(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Action item not found",
      });
    }

    // Security check: Ensure user owns this item
    if (item.userId.toString() !== req.user._id.toString()) {
      return res.status(401).json({
        success: false,
        error: "Not authorized",
      });
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Mark Actioned Error:", error);
    res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};

// @desc    Internal: Create Action (Protected/Admin only in real world, or internal usage)
// @route   POST /api/feed/internal/create
// @access  Private (Admin)
exports.createInternalAction = async (req, res) => {
  try {
    // In a real microservice, this would be protected by API Key
    // here we just check for Admin role or similar if exposed publicly
    // For now, let's assume it's protected by standard Auth middleware

    const action = await FeedService.createAction(req.body);

    res.status(201).json({
      success: true,
      data: action,
    });
  } catch (error) {
    console.error("Create Internal Action Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
