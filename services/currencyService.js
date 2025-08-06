const axios = require('axios');

class CurrencyService {
  constructor() {
    this.baseUrl = 'https://api.exchangerate-api.com/v4/latest/USD';
    this.fallbackRates = {
      'USD': 1,
      'EUR': 0.85,
      'GBP': 0.73,
      'INR': 83.12,
      'CAD': 1.36,
      'AUD': 1.52,
      'JPY': 149.50,
      'CNY': 7.24
    };
    this.cache = {
      rates: null,
      lastUpdated: null,
      cacheDuration: 3600000 // 1 hour in milliseconds
    };
  }

  // Get exchange rates with caching and fallback
  async getExchangeRates() {
    try {
      // Check if cache is still valid
      if (this.cache.rates && this.cache.lastUpdated && 
          (Date.now() - this.cache.lastUpdated) < this.cacheDuration) {
        console.log('Using cached exchange rates');
        return this.cache.rates;
      }

      console.log('Fetching fresh exchange rates from API...');
      const response = await axios.get(this.baseUrl, {
        timeout: 5000 // 5 second timeout
      });

      if (response.data && response.data.rates) {
        const rates = response.data.rates;
        
        // Ensure USD is always 1
        rates['USD'] = 1;
        
        // Cache the rates
        this.cache.rates = rates;
        this.cache.lastUpdated = Date.now();
        
        console.log('Successfully fetched exchange rates:', Object.keys(rates));
        return rates;
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('Error fetching exchange rates:', error.message);
      console.log('Using fallback exchange rates');
      return this.fallbackRates;
    }
  }

  // Convert amount from one currency to USD
  convertToUSD(amount, fromCurrency) {
    if (!amount || isNaN(amount)) return 0;
    
    const rates = this.cache.rates || this.fallbackRates;
    const rate = rates[fromCurrency] || 1;
    
    // If the rate is how much USD equals 1 unit of the currency
    // Then to convert to USD: amount / rate
    return amount / rate;
  }

  // Convert amount from USD to another currency
  convertFromUSD(amount, toCurrency) {
    if (!amount || isNaN(amount)) return 0;
    
    const rates = this.cache.rates || this.fallbackRates;
    const rate = rates[toCurrency] || 1;
    
    // If the rate is how much USD equals 1 unit of the currency
    // Then to convert from USD: amount * rate
    return amount * rate;
  }

  // Convert between any two currencies
  convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    
    // First convert to USD, then to target currency
    const usdAmount = this.convertToUSD(amount, fromCurrency);
    return this.convertFromUSD(usdAmount, toCurrency);
  }

  // Get formatted currency string
  formatCurrency(amount, currency = 'USD') {
    if (!amount || isNaN(amount)) return '0.00';
    
    const formatters = {
      'USD': new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
      'EUR': new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }),
      'GBP': new Intl.NumberFormat('en-US', { style: 'currency', currency: 'GBP' }),
      'INR': new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
      'CAD': new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }),
      'AUD': new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }),
      'JPY': new Intl.NumberFormat('en-US', { style: 'currency', currency: 'JPY' }),
      'CNY': new Intl.NumberFormat('en-US', { style: 'currency', currency: 'CNY' })
    };

    const formatter = formatters[currency] || formatters['USD'];
    return formatter.format(amount);
  }

  // Clear cache (useful for testing or manual refresh)
  clearCache() {
    this.cache.rates = null;
    this.cache.lastUpdated = null;
  }

  // Get cache status
  getCacheStatus() {
    return {
      hasRates: !!this.cache.rates,
      lastUpdated: this.cache.lastUpdated,
      isExpired: this.cache.lastUpdated ? 
        (Date.now() - this.cache.lastUpdated) > this.cacheDuration : true
    };
  }
}

module.exports = new CurrencyService(); 