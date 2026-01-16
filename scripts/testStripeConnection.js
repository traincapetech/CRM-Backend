require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testStripeConnection() {
  console.log('🔍 Testing Stripe Connection...\n');

  try {
    // Test 1: Basic API connection
    console.log('1. Testing API connection...');
    const account = await stripe.accounts.retrieve();
    console.log('✅ Stripe connection successful!');
    console.log(`   Account: ${account.business_profile?.name || 'Test Account'}`);
    console.log(`   Mode: ${account.charges_enabled ? 'Live' : 'Test'}\n`);

    // Test 2: Create test customer
    console.log('2. Testing customer creation...');
    const customer = await stripe.customers.create({
      email: 'test@example.com',
      name: 'Test Customer',
      metadata: {
        test: 'true',
        crmId: 'test-123'
      }
    });
    console.log('✅ Test customer created successfully!');
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Email: ${customer.email}\n`);

    // Test 3: Create test product
    console.log('3. Testing product creation...');
    const product = await stripe.products.create({
      name: 'Test Product',
      description: 'Test product for CRM integration'
    });
    console.log('✅ Test product created successfully!');
    console.log(`   Product ID: ${product.id}`);
    console.log(`   Name: ${product.name}\n`);

    // Test 4: Create test price
    console.log('4. Testing price creation...');
    const price = await stripe.prices.create({
      unit_amount: 1000, // $10.00
      currency: 'usd',
      product: product.id
    });
    console.log('✅ Test price created successfully!');
    console.log(`   Price ID: ${price.id}`);
    console.log(`   Amount: $${price.unit_amount / 100}\n`);

    // Test 5: Create test invoice
    console.log('5. Testing invoice creation...');
    await stripe.invoiceItems.create({
      customer: customer.id,
      price: price.id,
      quantity: 1
    });

    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 30
    });
    console.log('✅ Test invoice created successfully!');
    console.log(`   Invoice ID: ${invoice.id}`);
    console.log(`   Status: ${invoice.status}\n`);

    // Test 6: Cleanup test data
    console.log('6. Cleaning up test data...');
    await stripe.invoices.voidInvoice(invoice.id);
    await stripe.customers.del(customer.id);
    await stripe.products.del(product.id);
    console.log('✅ Test data cleaned up successfully!\n');

    console.log('🎉 All Stripe tests passed! Your integration is ready.');
    console.log('\n📋 Next Steps:');
    console.log('1. Set up webhook endpoint');
    console.log('2. Test with real CRM data');
    console.log('3. Configure payment methods');
    console.log('4. Go live with real customers');

  } catch (error) {
    console.error('❌ Stripe test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your STRIPE_SECRET_KEY in .env file');
    console.log('2. Ensure you have a Stripe account');
    console.log('3. Verify your account is not restricted');
    console.log('4. Check Stripe dashboard for any issues');
  }
}

// Run the test
testStripeConnection(); 