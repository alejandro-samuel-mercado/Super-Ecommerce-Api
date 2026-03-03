// migrate-env-check
require('dotenv').config();
const axios = require('axios');

async function simulateWebhook() {
    const saleId = process.argv[2];
    
    if (!saleId) {
        console.error('Usage: node simulate-webhook.js <saleId>');
        process.exit(1);
    }

    console.log(`Simulating MP Webhook for Sale ID: ${saleId}`);
    
    // Note: In a real scenario, we would need to mock the MP API check calling us back.
    // However, our Strategy fetches data from MP.
    // So this script will fail if the payment doesn't actually exist in MP.
    
    // BUT! For testing our CONTROLLER logic (without hitting MP), 
    // we might need to mock the Strategy or the PaymentGatewayFactory return.
    
    // Alternatively, we can use the Mock Strategy I created for Stripe to test the flow?
    // Let's try to hit the Stripe webhook which is mocked in StripeStrategy.
    
    const gatewaySlug = 'stripe';
    const url = `http://localhost:${process.env.PORT || 3001}/api/payments/webhooks/${gatewaySlug}`;
    
    const payload = {
        type: 'checkout.session.completed',
        data: {
            object: {
                id: `evt_test_${Date.now()}`,
                object: 'checkout.session',
                payment_status: 'paid',
                status: 'complete',
                client_reference_id: saleId,
                metadata: {
                    saleId: saleId
                }
            }
        }
    };
    
    try {
        const response = await axios.post(url, payload);
        console.log(`Response: ${response.status} ${response.statusText}`);
        console.log('Body:', response.data);
    } catch (error) {
        console.error('Error sending webhook:', error.response?.data || error.message);
    }
}

simulateWebhook();
