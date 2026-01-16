/**
 * Environment Variable Validation Utility
 * Validates required environment variables before server starts
 */

const requiredEnvVars = [
  'MONGO_URI',
  'JWT_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'NODE_ENV'
];

// Optional but recommended for Paytm payouts (migrated from Razorpay)
const optionalEnvVars = [
  'PAYTM_MERCHANT_ID',
  'PAYTM_MERCHANT_KEY',
  'ENCRYPTION_KEY'
];

const validateEnvironment = () => {
  console.log('\n🔍 Validating environment variables...\n');

  const missing = [];
  const present = [];

  requiredEnvVars.forEach(varName => {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missing.push(varName);
    } else {
      present.push(varName);
    }
  });

  if (present.length > 0) {
    console.log('✅ Required variables present:');
    present.forEach(varName => {
      let displayValue = '***';
      if (varName === 'NODE_ENV') {
        displayValue = process.env[varName];
      } else if (varName === 'MONGO_URI') {
        displayValue = process.env[varName].includes('mongodb+srv') 
          ? 'MongoDB Atlas (remote)' 
          : 'MongoDB Local';
      }
      console.log(`   ✓ ${varName}: ${displayValue}`);
    });
  }

  if (missing.length > 0) {
    console.error('\n❌ FATAL: Missing required environment variables:\n');
    missing.forEach(varName => console.error(`   ✗ ${varName}`));
    console.error('\n💡 Please set these in your .env file or environment');
    console.error('\nExample .env:');
    console.error('MONGO_URI=mongodb+srv://your-cluster/crm');
    console.error('JWT_SECRET=your-64-char-random-secret-here');
    console.error('EMAIL_USER=crm@traincapetech.in');
    console.error('EMAIL_PASS=your-email-password');
    console.error('NODE_ENV=production\n');
    process.exit(1);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('\n⚠️  WARNING: JWT_SECRET should be at least 32 characters for security');
    console.warn('   Current length:', process.env.JWT_SECRET.length);
    console.warn('   Generate strong secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n');
  }

  // Check optional variables for Razorpay payouts
  const missingOptional = [];
  optionalEnvVars.forEach(varName => {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missingOptional.push(varName);
    }
  });

  if (missingOptional.length > 0) {
    console.warn('\n⚠️  Optional variables not set (Paytm payouts will not work):');
    missingOptional.forEach(varName => {
      console.warn(`   ⚠ ${varName}`);
    });
    console.warn('\n💡 To enable Paytm payouts, add these to your .env:');
    console.warn('   PAYTM_MERCHANT_ID=your_paytm_merchant_id');
    console.warn('   PAYTM_MERCHANT_KEY=your_paytm_merchant_key');
    console.warn('   ENCRYPTION_KEY=<generate-with-command-below>');
    console.warn('   Generate encryption key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
  } else {
    console.log('✅ Paytm configuration present (payouts enabled)');
  }

  console.log('\n✅ Environment validation passed!\n');
  return true;
};

module.exports = validateEnvironment;
