require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function setupStripeWebhook() {
  console.log('🔧 Stripe Webhook Setup Guide\n');

  try {
    // Get current webhooks
    console.log('📋 Current webhooks:');
    const webhooks = await stripe.webhookEndpoints.list();
    
    if (webhooks.data.length === 0) {
      console.log('   No webhooks found. You need to create one.\n');
    } else {
      webhooks.data.forEach((webhook, index) => {
        console.log(`   ${index + 1}. ${webhook.url}`);
        console.log(`      Status: ${webhook.status}`);
        console.log(`      Events: ${webhook.enabled_events.join(', ')}\n`);
      });
    }

    console.log('🚀 To set up webhook manually:\n');
    console.log('1. Go to https://dashboard.stripe.com/webhooks');
    console.log('2. Click "Add endpoint"');
    console.log('3. Enter your webhook URL:');
    console.log('   Local: https://your-ngrok-url.ngrok.io/api/stripe-invoices/webhook');
    console.log('   Production: https://yourdomain.com/api/stripe-invoices/webhook');
    console.log('4. Select these events:');
    console.log('   - invoice.payment_succeeded');
    console.log('   - invoice.payment_failed');
    console.log('   - invoice.finalized');
    console.log('   - invoice.voided');
    console.log('5. Copy the webhook signing secret');
    console.log('6. Add to your .env file: STRIPE_WEBHOOK_SECRET=whsec_...\n');

    console.log('🧪 Test webhook locally:');
    console.log('1. Install ngrok: npm install -g ngrok');
    console.log('2. Start your server: npm start');
    console.log('3. In another terminal: ngrok http 8080');
    console.log('4. Use the ngrok URL as your webhook endpoint\n');

    console.log('📊 Webhook Testing:');
    console.log('1. Use Stripe CLI: stripe listen --forward-to localhost:8080/api/stripe-invoices/webhook');
    console.log('2. Or test manually in Stripe dashboard');
    console.log('3. Check server logs for webhook events\n');

    console.log('🔍 Troubleshooting:');
    console.log('- Ensure webhook URL is publicly accessible');
    console.log('- Check webhook secret matches your .env file');
    console.log('- Verify server is running and endpoint exists');
    console.log('- Check Stripe dashboard for webhook delivery status');

  } catch (error) {
    console.error('❌ Error checking webhooks:', error.message);
  }
}

// Run the setup guide
setupStripeWebhook(); 