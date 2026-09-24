const mongoose = require('mongoose');

const SaleCollectionAssignmentSchema = new mongoose.Schema(
  {
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: [true, 'Please provide the related sale ID'],
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please assign a collection owner'],
      index: true,
    },
    assignedAmount: {
      type: Number,
      required: [true, 'Please provide the assigned collection amount'],
      min: [0.01, 'Assigned amount must be greater than zero'],
    },
    collectedAmount: {
      type: Number,
      default: 0,
      min: [0, 'Collected amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'USD',
      trim: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'REASSIGNED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    reassignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reassignedAt: {
      type: Date,
      default: null,
    },
    reassignmentReason: {
      type: String,
      trim: true,
      default: '',
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    collections: [
      {
        amount: {
          type: Number,
          required: true,
          min: 0.01,
        },
        collectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        collectedAt: {
          type: Date,
          default: Date.now,
        },
        notes: {
          type: String,
          trim: true,
          default: '',
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Virtual for remaining uncollected amount on this assignment
SaleCollectionAssignmentSchema.virtual('remainingAmount').get(function () {
  return Math.max(0, (this.assignedAmount || 0) - (this.collectedAmount || 0));
});

// Ensure virtuals are included when converting to JSON / Object
SaleCollectionAssignmentSchema.set('toJSON', { virtuals: true });
SaleCollectionAssignmentSchema.set('toObject', { virtuals: true });

// Compound indexes for fast reporting and queries
SaleCollectionAssignmentSchema.index({ saleId: 1, status: 1 });
SaleCollectionAssignmentSchema.index({ assignedTo: 1, status: 1 });
SaleCollectionAssignmentSchema.index({ assignedAt: -1 });

module.exports = mongoose.model('SaleCollectionAssignment', SaleCollectionAssignmentSchema);
