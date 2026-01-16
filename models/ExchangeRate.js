const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema({
  rates: {
    type: Map,
    of: Number,
    default: {
      'USD': 1,
      'EUR': 0.85,
      'GBP': 0.73,
      'INR': 83.12,
      'CAD': 1.36,
      'AUD': 1.52,
      'JPY': 149.50,
      'CNY': 7.24
    }
  },
  baseCurrency: {
    type: String,
    default: 'USD'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create a default exchange rate document if none exists
exchangeRateSchema.statics.getOrCreateDefault = async function() {
  let exchangeRate = await this.findOne();
  if (!exchangeRate) {
    exchangeRate = await this.create({});
  }
  return exchangeRate;
};

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema); 