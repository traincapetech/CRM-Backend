const mongoose = require('mongoose');

const ITProjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['ACTIVE', 'PENDING', 'COMPLETED', 'ON_HOLD'], default: 'ACTIVE' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  technologies: [{ type: String, trim: true }],
  team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  department: { type: String, default: 'IT' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ITProject', ITProjectSchema);
