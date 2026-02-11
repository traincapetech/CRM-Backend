const ActionItem = require("../models/ActionItem");
const User = require("../models/User");

/**
 * Service to manage the Unified Action Feed
 * "The Brain" of the Experience Engine's Feed Layer
 */
class FeedService {
  /**
   * Create a new Action Item in a user's feed
   * @param {Object} data - Action Item data
   * @returns {Promise<Object>} Created Action Item
   */
  async createAction(data) {
    try {
      const {
        userId,
        type,
        module,
        title,
        priority,
        sourceId,
        sourceCollection,
      } = data;

      // Basic validation
      if (!userId || !type || !module || !title) {
        throw new Error("Missing required fields for Action Item");
      }

      // Idempotency check: Don't create duplicate active actions for the same source
      if (sourceId && sourceCollection) {
        const existing = await ActionItem.findOne({
          userId,
          sourceId,
          sourceCollection,
          isActioned: false,
        });

        if (existing) {
          console.log(
            `FeedService: Duplicate action prevented for ${sourceCollection}:${sourceId}`,
          );
          return existing;
        }
      }

      const actionItem = await ActionItem.create({
        ...data,
        isActioned: false,
        isRead: false,
      });

      console.log(
        `FeedService: Created ${priority} priority action for user ${userId}`,
      );
      return actionItem;
    } catch (error) {
      console.error("FeedService Create Error:", error);
      throw error;
    }
  }

  /**
   * Get the Feed for a specific user
   * @param {string} userId - User ID
   * @param {Object} options - { limit, offset, includeActioned }
   * @returns {Promise<Array>} List of Action Items
   */
  async getUserFeed(userId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        includeActioned = false,
        targetId,
      } = options;

      const query = { userId };

      if (!includeActioned) {
        query.isActioned = false;
      }

      let feed = await ActionItem.find(query)
        .sort({ priority: -1, createdAt: -1 }) // High priority, newest first
        .skip(offset)
        .limit(limit);

      // If targetId is provided, ensure it's in the list (fetch separately if needed)
      if (targetId) {
        const targetInFeed = feed.find(
          (item) => item._id.toString() === targetId,
        );
        if (!targetInFeed) {
          const targetItem = await ActionItem.findOne({
            _id: targetId,
            userId,
          });
          if (targetItem) {
            feed = [targetItem, ...feed];
          }
        } else {
          // Move to top
          feed = [
            targetInFeed,
            ...feed.filter((item) => item._id.toString() !== targetId),
          ];
        }
      }

      return feed;
    } catch (error) {
      console.error("FeedService GetFeed Error:", error);
      throw error;
    }
  }

  /**
   * Mark an item as actioned/completed
   * @param {string} actionId
   * @returns {Promise<Object>} Updated Action Item
   */
  async markActioned(actionId) {
    try {
      const item = await ActionItem.findByIdAndUpdate(
        actionId,
        { isActioned: true, isRead: true },
        { new: true },
      );
      return item;
    } catch (error) {
      console.error("FeedService MarkActioned Error:", error);
      throw error;
    }
  }

  /**
   * Dismiss an item (Mark as read/actioned without taking primary action)
   * @param {string} actionId
   */
  async dismissAction(actionId) {
    return this.markActioned(actionId);
  }
}

module.exports = new FeedService();
