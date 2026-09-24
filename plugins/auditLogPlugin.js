const mongoose = require("mongoose");
const { requestContext } = require("../middleware/context");

// Helper to extract key descriptive details of a document for flat rendering in logs list
const getDocDetails = (doc) => {
  const details = {};
  if (!doc) return details;

  // Primary descriptors
  if (doc.name) details.name = doc.name;
  else if (doc.fullName) details.fullName = doc.fullName;
  else if (doc.officeName) details.officeName = doc.officeName;
  else if (doc.title) details.title = doc.title;
  else if (doc.subject) details.subject = doc.subject;

  // Secondary descriptors
  if (doc.email) details.email = doc.email;
  if (doc.status !== undefined) details.status = String(doc.status);
  if (doc.course) details.course = doc.course;
  if (doc.amount !== undefined) details.amount = String(doc.amount);
  if (doc.role) details.role = doc.role;

  // If we couldn't resolve any descriptive keys, extract first 4 non-metadata primitive fields
  if (Object.keys(details).length === 0) {
    try {
      const obj = doc.toObject ? doc.toObject() : doc;
      let count = 0;
      for (const [k, v] of Object.entries(obj)) {
        if (count >= 4) break;
        if (
          v !== null &&
          typeof v !== "object" &&
          !["_id", "__v", "createdAt", "updatedAt", "password"].includes(k)
        ) {
          details[k] = String(v);
          count++;
        }
      }
    } catch (e) {
      // Ignore conversion errors
    }
  }

  return details;
};

const auditLogPlugin = (schema) => {
  // Pre-save hook: Determine if it's new, and capture original doc if updating
  schema.pre("save", async function(next) {
    const modelName = this.constructor.modelName;
    
    // Skip subdocuments/embedded documents (they don't have a modelName)
    if (!modelName) {
      return next();
    }
    
    // Skip logging internal log tables to avoid infinite recursion loops
    if (
      [
        "Log",
        "LoginHistory",
        "ChatMessage",
        "ChatRoom",
        "Notification",
        "Counter",
        "NotificationSubscription",
        "UserActivity"
      ].includes(modelName)
    ) {
      return next();
    }

    this._isNew = this.isNew;
    if (!this.isNew) {
      try {
        // Fetch original document from database prior to save
        this._originalDoc = await this.constructor.findById(this._id).lean();
      } catch (err) {
        console.error(`[Audit Log Plugin] Error pre-save for ${modelName}:`, err);
      }
    }
    next();
  });

  // Post-save hook: Log creation or diffs on updates
  schema.post("save", async function(doc) {
    const modelName = doc?.constructor?.modelName;
    
    // Skip subdocuments/embedded documents (they don't have a modelName)
    if (!modelName) {
      return;
    }
    
    if (
      [
        "Log",
        "LoginHistory",
        "ChatMessage",
        "ChatRoom",
        "Notification",
        "Counter",
        "NotificationSubscription",
        "UserActivity"
      ].includes(modelName)
    ) {
      return;
    }

    const store = requestContext.getStore();
    const userId = store?.get("userId") || doc.userId || doc.createdBy || null;
    const ipAddress = store?.get("ipAddress") || "";
    const userAgent = store?.get("userAgent") || "";

    // Skip log creation if we don't have a valid mongoose model initialized yet (defensive check)
    let Log;
    try {
      Log = mongoose.model("Log");
    } catch (err) {
      return;
    }

    if (this._isNew) {
      await Log.create({
        action: `${modelName.toUpperCase()}_CREATE`,
        performedBy: userId || "500000000000000000000000",
        timestamp: new Date(),
        details: getDocDetails(doc),
        affectedResource: modelName,
        resourceId: doc._id,
        newState: doc.toObject(),
        ipAddress,
        userAgent,
        status: "SUCCESS"
      }).catch(err => console.error("[Audit Log Plugin] Failed to create log:", err));
    } else {
      const changes = {};
      const previousState = {};
      const newState = {};

      const currentObj = doc.toObject();
      const originalObj = this._originalDoc || {};

      for (const key of Object.keys(currentObj)) {
        if (["updatedAt", "createdAt", "__v", "password"].includes(key)) continue;

        const oldVal = originalObj[key];
        const newVal = currentObj[key];

        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes[key] = { old: oldVal, new: newVal };
          previousState[key] = oldVal;
          newState[key] = newVal;
        }
      }

      if (Object.keys(changes).length > 0) {
        await Log.create({
          action: `${modelName.toUpperCase()}_UPDATE`,
          performedBy: userId || "500000000000000000000000",
          timestamp: new Date(),
          details: changes,
          affectedResource: modelName,
          resourceId: doc._id,
          previousState,
          newState,
          ipAddress,
          userAgent,
          status: "SUCCESS"
        }).catch(err => console.error("[Audit Log Plugin] Failed to create log:", err));
      }
    }
  });

  // Query-based updates (findOneAndUpdate, updateOne, updateMany)
  schema.pre(["updateOne", "updateMany", "findOneAndUpdate"], async function(next) {
    const modelName = this.model.modelName;
    if (
      [
        "Log",
        "LoginHistory",
        "ChatMessage",
        "ChatRoom",
        "Notification",
        "Counter",
        "NotificationSubscription",
        "UserActivity"
      ].includes(modelName)
    ) {
      return next();
    }

    try {
      const query = this.getQuery();
      this._originalDocs = await this.model.find(query).lean();
    } catch (err) {
      console.error(`[Audit Log Plugin] Error pre-update query for ${modelName}:`, err);
    }
    next();
  });

  schema.post(["updateOne", "updateMany", "findOneAndUpdate"], async function() {
    const modelName = this.model.modelName;
    if (
      [
        "Log",
        "LoginHistory",
        "ChatMessage",
        "ChatRoom",
        "Notification",
        "Counter",
        "NotificationSubscription",
        "UserActivity"
      ].includes(modelName)
    ) {
      return;
    }

    const store = requestContext.getStore();
    const userId = store?.get("userId") || null;
    const ipAddress = store?.get("ipAddress") || "";
    const userAgent = store?.get("userAgent") || "";

    let Log;
    try {
      Log = mongoose.model("Log");
    } catch (err) {
      return;
    }

    const originalDocs = this._originalDocs || [];
    for (const originalDoc of originalDocs) {
      try {
        const updatedDoc = await this.model.findById(originalDoc._id).lean();
        if (!updatedDoc) continue;

        const changes = {};
        const previousState = {};
        const newState = {};

        for (const key of Object.keys(updatedDoc)) {
          if (["updatedAt", "createdAt", "__v", "password"].includes(key)) continue;

          const oldVal = originalDoc[key];
          const newVal = updatedDoc[key];

          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes[key] = { old: oldVal, new: newVal };
            previousState[key] = oldVal;
            newState[key] = newVal;
          }
        }

        if (Object.keys(changes).length > 0) {
          await Log.create({
            action: `${modelName.toUpperCase()}_UPDATE`,
            performedBy: userId || "500000000000000000000000",
            timestamp: new Date(),
            details: changes,
            affectedResource: modelName,
            resourceId: originalDoc._id,
            previousState,
            newState,
            ipAddress,
            userAgent,
            status: "SUCCESS"
          }).catch(err => console.error("[Audit Log Plugin] Failed to create log:", err));
        }
      } catch (err) {
        console.error(`[Audit Log Plugin] Post-update processing error for ${modelName}:`, err);
      }
    }
  });

  // Deletion hooks (deleteOne, deleteMany, findOneAndDelete, remove)
  schema.pre(["deleteOne", "deleteMany", "findOneAndDelete", "remove"], async function(next) {
    const modelName = this.model ? this.model.modelName : (this.constructor ? this.constructor.modelName : "Document");
    if (
      [
        "Log",
        "LoginHistory",
        "ChatMessage",
        "ChatRoom",
        "Notification",
        "Counter",
        "NotificationSubscription",
        "UserActivity"
      ].includes(modelName)
    ) {
      return next();
    }

    try {
      const query = this.getQuery ? this.getQuery() : { _id: this._id };
      this._deletedDocs = await (this.getQuery ? this.model.find(query) : this.constructor.find(query)).lean();
    } catch (err) {
      console.error(`[Audit Log Plugin] Error pre-delete query for ${modelName}:`, err);
    }
    next();
  });

  schema.post(["deleteOne", "deleteMany", "findOneAndDelete", "remove"], async function() {
    const modelName = this.model ? this.model.modelName : "Document";
    if (
      [
        "Log",
        "LoginHistory",
        "ChatMessage",
        "ChatRoom",
        "Notification",
        "Counter",
        "NotificationSubscription",
        "UserActivity"
      ].includes(modelName)
    ) {
      return;
    }

    const store = requestContext.getStore();
    const userId = store?.get("userId") || null;
    const ipAddress = store?.get("ipAddress") || "";
    const userAgent = store?.get("userAgent") || "";

    let Log;
    try {
      Log = mongoose.model("Log");
    } catch (err) {
      return;
    }

    const deletedDocs = this._deletedDocs || [];
    for (const doc of deletedDocs) {
      try {
        await Log.create({
          action: `${modelName.toUpperCase()}_DELETE`,
          performedBy: userId || "500000000000000000000000",
          timestamp: new Date(),
          details: getDocDetails(doc),
          affectedResource: modelName,
          resourceId: doc._id,
          previousState: doc,
          ipAddress,
          userAgent,
          status: "SUCCESS"
        }).catch(err => console.error("[Audit Log Plugin] Failed to create log:", err));
      } catch (err) {
        console.error(`[Audit Log Plugin] Post-delete processing error for ${modelName}:`, err);
      }
    }
  });
};

module.exports = auditLogPlugin;
