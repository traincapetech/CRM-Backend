const axios = require('axios');

let cachedRates = null;
let lastFetched = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

// Try multiple APIs until one works
const APIs = [
  { url: 'https://api.exchangerate-api.com/v4/latest/USD', path: 'rates' },
  { url: 'https://open.er-api.com/v6/latest/USD', path: 'rates' },
  { url: 'https://api.exchangerate.host/latest?base=USD', path: 'rates' }
];

// Expanded list of supported currencies
const SUPPORTED_CURRENCIES = [
  'USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CNY', 
  'SGD', 'CHF', 'AED', 'ZAR', 'BRL', 'MXN', 'HKD', 'SEK',
  'NZD', 'THB', 'IDR', 'MYR', 'PHP', 'SAR', 'KRW', 'VND'
];

// Fallback rates in case all APIs fail
const fallbackRates = {
  USD: 1,
  INR: 84.62,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 151.15,
  CAD: 1.37,
  AUD: 1.52,
  CNY: 7.24,
  SGD: 1.35,
  CHF: 0.90,
  AED: 3.67,
  ZAR: 18.39,
  BRL: 5.14,
  MXN: 17.04,
  HKD: 7.81,
  SEK: 10.58,
  NZD: 1.64,
  THB: 36.25,
  IDR: 15928.30,
  MYR: 4.72,
  PHP: 57.14,
  SAR: 3.75,
  KRW: 1362.26,
  VND: 25162.50
};

// Get exchange rates from API or cache
exports.getRates = async (req, res) => {
  const now = Date.now();

  // Return cached rates if fresh enough
  if (cachedRates && now - lastFetched < CACHE_DURATION) {
    return res.json(cachedRates);
  }

  // Try APIs in sequence until one succeeds
  for (const api of APIs) {
    try {
      console.log(`Attempting to fetch rates from: ${api.url}`);
      const response = await axios.get(api.url);
      
      if (response.data && response.data[api.path]) {
        // We have a valid response
        const rates = response.data[api.path];
        
        // Create a standardized response format with all supported currencies
        const standardizedRates = { USD: 1 }; // USD is always 1 as base
        
        // Add all available currencies from the API response
        for (const currency of SUPPORTED_CURRENCIES) {
          if (rates[currency]) {
            standardizedRates[currency] = rates[currency];
          }
        }
        
        cachedRates = {
          base: 'USD',
          date: new Date().toISOString(),
          rates: standardizedRates
        };
        
        lastFetched = now;
        console.log(`Exchange rates updated successfully with ${Object.keys(standardizedRates).length} currencies`);
        return res.json(cachedRates);
      }
    } catch (err) {
      console.error(`API ${api.url} failed: ${err.message}`);
      // Continue to next API
    }
  }

  // All APIs failed, use fallback rates
  console.log('All currency APIs failed, using fallback rates');
  if (!cachedRates) {
    // First-time failure, create cache with fallback rates
    cachedRates = {
      base: 'USD',
      date: new Date().toISOString(),
      rates: fallbackRates,
      source: 'fallback'
    };
  } else {
    // Update existing cache timestamp but keep the rates
    cachedRates.date = new Date().toISOString();
    cachedRates.source = 'fallback';
  }
  
  lastFetched = now;
  res.json(cachedRates);
}; 