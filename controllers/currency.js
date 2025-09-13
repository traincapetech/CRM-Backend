const axios = require('axios');

let cachedRates = null;
let lastFetched = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache for real-time updates

// Try multiple APIs until one works - Updated with more reliable sources
const APIs = [
  { url: 'https://api.exchangerate-api.com/v4/latest/USD', path: 'rates', name: 'ExchangeRate-API' },
  { url: 'https://open.er-api.com/v6/latest/USD', path: 'rates', name: 'Open Exchange Rates' },
  { url: 'https://api.exchangerate.host/latest?base=USD', path: 'rates', name: 'ExchangeRate-Host' },
  { url: 'https://api.fxratesapi.com/latest?base=USD', path: 'rates', name: 'FXRates API' },
  { url: 'https://api.currencyapi.com/v3/latest?apikey=free&currencies=INR,EUR,GBP,JPY,CAD,AUD,CNY,SGD,CHF,AED,ZAR,BRL,MXN,HKD,SEK,NZD,THB,IDR,MYR,PHP,SAR,KRW,VND&base_currency=USD', path: 'data', name: 'CurrencyAPI' }
];

// Expanded list of supported currencies
const SUPPORTED_CURRENCIES = [
  'USD', 'INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CNY', 
  'SGD', 'CHF', 'AED', 'ZAR', 'BRL', 'MXN', 'HKD', 'SEK',
  'NZD', 'THB', 'IDR', 'MYR', 'PHP', 'SAR', 'KRW', 'VND'
];

// Updated fallback rates with current market rates (as of January 2025)
const fallbackRates = {
  USD: 1,
  INR: 83.15,    // Updated to current rate
  EUR: 0.92,     // Updated to current rate
  GBP: 0.79,     // Updated to current rate
  JPY: 150.25,   // Updated to current rate
  CAD: 1.37,     // Updated to current rate
  AUD: 1.51,     // Updated to current rate
  CNY: 7.15,     // Updated to current rate
  SGD: 1.35,     // Updated to current rate
  CHF: 0.90,     // Updated to current rate
  AED: 3.67,     // Updated to current rate
  ZAR: 18.39,    // Updated to current rate
  BRL: 5.14,     // Updated to current rate
  MXN: 17.04,    // Updated to current rate
  HKD: 7.81,     // Updated to current rate
  SEK: 10.58,    // Updated to current rate
  NZD: 1.64,     // Updated to current rate
  THB: 36.25,    // Updated to current rate
  IDR: 15928.30, // Updated to current rate
  MYR: 4.72,     // Updated to current rate
  PHP: 56.25,    // Updated to current rate
  SAR: 3.75,     // Updated to current rate
  KRW: 1362.26,  // Updated to current rate
  VND: 25162.50  // Updated to current rate
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
      console.log(`🔄 Attempting to fetch rates from: ${api.name} (${api.url})`);
      const response = await axios.get(api.url, { timeout: 10000 }); // 10 second timeout
      
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
          rates: standardizedRates,
          source: api.name,
          apiUrl: api.url
        };
        
        lastFetched = now;
        console.log(`✅ Exchange rates updated successfully from ${api.name} with ${Object.keys(standardizedRates).length} currencies`);
        console.log(`📊 Key rates: INR=${standardizedRates.INR}, EUR=${standardizedRates.EUR}, GBP=${standardizedRates.GBP}`);
        return res.json(cachedRates);
      } else {
        console.warn(`⚠️ API ${api.name} returned invalid response format`);
      }
    } catch (err) {
      console.error(`❌ API ${api.name} failed: ${err.message}`);
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

// Force refresh exchange rates (bypass cache)
exports.refreshRates = async (req, res) => {
  try {
    console.log('🔄 Manual refresh requested - bypassing cache');
    
    // Reset cache to force fresh fetch
    cachedRates = null;
    lastFetched = 0;
    
    // Try to fetch fresh rates
    for (const api of APIs) {
      try {
        console.log(`🔄 Force fetching from: ${api.name} (${api.url})`);
        const response = await axios.get(api.url, { timeout: 10000 });
        
        if (response.data && response.data[api.path]) {
          const rates = response.data[api.path];
          const standardizedRates = { USD: 1 };
          
          for (const currency of SUPPORTED_CURRENCIES) {
            if (rates[currency]) {
              standardizedRates[currency] = rates[currency];
            }
          }
          
          cachedRates = {
            base: 'USD',
            date: new Date().toISOString(),
            rates: standardizedRates,
            source: api.name,
            apiUrl: api.url,
            refreshed: true
          };
          
          lastFetched = Date.now();
          console.log(`✅ Manual refresh successful from ${api.name}`);
          return res.json({
            success: true,
            message: `Rates refreshed from ${api.name}`,
            ...cachedRates
          });
        }
      } catch (err) {
        console.error(`❌ Force refresh failed for ${api.name}: ${err.message}`);
      }
    }
    
    // If all APIs failed, return error
    res.status(500).json({
      success: false,
      message: 'All currency APIs failed during manual refresh',
      fallback: true
    });
    
  } catch (error) {
    console.error('❌ Manual refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Manual refresh failed',
      error: error.message
    });
  }
}; 