const axios = require('axios');

// Test Stripe invoice creation
async function testStripeInvoice() {
  try {
    console.log('🧪 Testing Stripe invoice creation...');
    
    // First, try to login with a valid user
    const loginResponse = await axios.post('http://localhost:8080/api/auth/login', {
      email: 'SK@gmail.com',
      password: 'Canada@1212'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token received');
    
    // Get available invoices first
    const invoicesResponse = await axios.get('http://localhost:8080/api/invoices', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('📋 Available invoices:', invoicesResponse.data);
    
    // Check different possible response structures
    let invoices = [];
    if (invoicesResponse.data.invoices) {
      invoices = invoicesResponse.data.invoices;
    } else if (invoicesResponse.data.data) {
      invoices = invoicesResponse.data.data;
    } else if (Array.isArray(invoicesResponse.data)) {
      invoices = invoicesResponse.data;
    }
    
    console.log('📊 Found invoices:', invoices.length);
    
    if (invoices.length > 0) {
      const firstInvoice = invoices[0];
      console.log('🎯 Using first invoice for testing:', firstInvoice._id);
      
      // Test data for Stripe invoice creation
      const testData = {
        crmInvoiceId: firstInvoice._id,
        customerData: {
          email: 'test@example.com',
          name: 'Test Customer',
          company: 'Test Company'
        },
        items: firstInvoice.items || [
          {
            description: 'Test Service',
            quantity: 1,
            unitPrice: 100,
            taxRate: 10
          }
        ],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
      };
      
      console.log('📋 Test data prepared:', testData);
      
      // Create Stripe invoice
      const response = await axios.post('http://localhost:8080/api/stripe-invoices', testData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Stripe invoice created successfully!');
      console.log('📄 Response:', response.data);
    } else {
      console.log('⚠️ No invoices found to test with');
    }
    
  } catch (error) {
    console.error('❌ Error testing Stripe invoice:', error.response?.data || error.message);
    if (error.response?.data?.details) {
      console.error('🔍 Error details:', error.response.data.details);
    }
  }
}

testStripeInvoice(); 