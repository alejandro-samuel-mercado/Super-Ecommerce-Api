const PaymentGatewayFactory = require('../services/payment.factory');
const prisma = require('../config/prisma');

async function test() {
    console.log('🧪 Testing PaymentGatewayFactory...');

    try {
        // 1. ARS -> MercadoPago
        console.log('--- Testing ARS (Should be MercadoPago) ---');
        const arsGateway = await PaymentGatewayFactory.getGateway('ARS');
        console.log('Gateway Name:', arsGateway.constructor.name);
        if (arsGateway.constructor.name === 'MercadoPagoStrategy') {
            console.log('✅ ARS resolved correctly');
        } else {
            console.error('❌ ARS resolved incorrectly');
        }

        // 2. USD -> Stripe
        console.log('\n--- Testing USD (Should be Stripe) ---');
        const usdGateway = await PaymentGatewayFactory.getGateway('USD');
        console.log('Gateway Name:', usdGateway.constructor.name);
        if (usdGateway.constructor.name === 'StripeStrategy') {
            console.log('✅ USD resolved correctly');
        } else {
            console.error('❌ USD resolved incorrectly');
        }

        // 3. EUR -> Stripe
        console.log('\n--- Testing EUR (Should be Stripe) ---');
        const eurGateway = await PaymentGatewayFactory.getGateway('EUR');
        console.log('Gateway Name:', eurGateway.constructor.name);
        if (eurGateway.constructor.name === 'StripeStrategy') {
            console.log('✅ EUR resolved correctly');
        } else {
             console.error('❌ EUR resolved incorrectly');
        }

        // 4. JPY -> PayPal (Fallback)
        console.log('\n--- Testing JPY (Should be PayPal Fallback) ---');
        const jpyGateway = await PaymentGatewayFactory.getGateway('JPY');
        console.log('Gateway Name:', jpyGateway.constructor.name);
        if (jpyGateway.constructor.name === 'PayPalStrategy') {
            console.log('✅ JPY resolved correctly (Fallback)');
        } else {
             console.error('❌ JPY resolved incorrectly');
        }

    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

test();
