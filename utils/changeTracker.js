/**
 * Generic utility to track changes between two objects and generate a message
 * @param {Object} oldData - Original data (should be plain object, e.g. from toObject())
 * @param {Object} newData - Updated data (should be plain object)
 * @param {Object} fieldLabels - Mapping of field keys to human-readable labels
 * @returns {Array} - Array of strings describing changes
 */
const trackChanges = (oldData, newData, fieldLabels) => {
  const changes = [];
  
  for (const [field, label] of Object.entries(fieldLabels)) {
    let oldValue = oldData[field];
    let newValue = newData[field];

    // Handle ObjectIds/Populated fields/Nested objects
    // We check if it's an object (and not null) to handle populated fields
    const isOldObj = oldValue && typeof oldValue === 'object';
    const isNewObj = newValue && typeof newValue === 'object';

    if (isOldObj || isNewObj) {
      const oldId = (oldValue?._id || oldValue)?.toString();
      const newId = (newValue?._id || newValue)?.toString();
      
      if (oldId !== newId) {
        const oldName = oldValue?.fullName || oldValue?.name || (oldId ? "ID: " + oldId : "None");
        const newName = newValue?.fullName || newValue?.name || (newId ? "ID: " + newId : "None");
        changes.push(`${label}: ${oldName} -> ${newName}`);
      }
      continue;
    }

    // String/Number/Boolean comparison
    if (String(oldValue ?? "") !== String(newValue ?? "")) {
      changes.push(`${label}: ${oldValue ?? "N/A"} -> ${newValue ?? "N/A"}`);
    }
  }
  return changes;
};

module.exports = trackChanges;
