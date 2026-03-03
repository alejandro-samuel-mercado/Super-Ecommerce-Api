const PaymentService = require('../services/payment.service');
const PaymentController = require('../controllers/payment.controller');
const prisma = require('../config/prisma');

// Mock Request/Response for Controller Test
const mockReq = (body, user) => ({ body, user });
const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
};

async function testIntegration() {
    console.log('🔗 Testing Payment Integration Flow...');

    try {
        let user = await prisma.user.findFirst(); 
        if (!user) {
            console.log('   Creating Test User...');
            
            // Ensure Role exists
            let role = await prisma.role.findFirst({ where: { name: 'CUSTOMER' } });
            if (!role) {
                 role = await prisma.role.create({ data: { name: 'CUSTOMER' } });
            }

            user = await prisma.user.create({
                data: {
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'password123',
                    roleId: role.id
                }
            });
        }

        // Ensure Branch exists
        let branch = await prisma.branch.findFirst();
        if (!branch) {
             console.log('   Creating Test Branch...');
             branch = await prisma.branch.create({
                 data: {
                     name: 'Main Branch',
                     code: 'MAIN-001',
                     address: '123 Main St',
                     city: 'City',
                     state: 'State',
                     phone: '1234567890',
                     operatingHours: {},
                     isActive: true
                 }
             });
        }

        const sale = await prisma.sale.create({
            data: {
                userId: user.id,
                branchId: branch.id,
                total: 1000,
                subtotal: 1000,
                currencyCode: 'USD',
                paymentStatus: 'PENDING',
                paymentType: 'MERCADO_PAGO', // or generic
                items: {
                    create: [
                        { 
                            // skuId removed to avoid FK error
                            quantity: 1, 
                            unitPrice: 1000, 
                            subtotal: 1000,
                            productName: 'Test Product',
                            skuCode: 'TEST-SKU-10'  
                        }
                    ]
                }
            }
        });
        console.log(`   Sale created: #${sale.id} (USD)`);

        // 2. Test Initiate Payment with Primary (Stripe for USD)
        console.log('\n2. Testing Primary Gateway (Stripe)...');
        const req1 = mockReq({ saleId: sale.id }, { id: user.id });
        const res1 = mockRes();
        
        // We call controller method directly to simulate route
        await PaymentController.initiatePayment(req1, res1);
        
        console.log('   Response:', res1.data);
        if (res1.data.success && res1.data.initPoint.includes('stripe')) {
            console.log('   ✅ Stripe Initiation Success');
        } else {
            console.error('   ❌ Stripe Initiation Failed', res1.data);
        }

        // 3. Test Initiate Payment with Fallback (PayPal)
        console.log('\n3. Testing Fallback Gateway (PayPal)...');
        const req2 = mockReq({ saleId: sale.id, gatewaySlug: 'paypal' }, { id: user.id });
        const res2 = mockRes();
        
        await PaymentController.initiatePayment(req2, res2);

        console.log('   Response:', res2.data);
        if (res2.data.success && res2.data.initPoint.includes('paypal')) {
            console.log('   ✅ PayPal Initiation Success');
        } else {
            console.error('   ❌ PayPal Initiation Failed', res2.data);
        }

        // 4. Verify Database Update
        const updatedSale = await prisma.sale.findUnique({ where: { id: sale.id } });
        console.log(`\n4. Verifying DB Audit...`);
        console.log(`   Sale Payment Gateway: ${updatedSale.paymentGateway}`);
        if (updatedSale.paymentGateway === 'paypal') {
            console.log('   ✅ Audit Correct');
        } else {
            console.error('   ❌ Audit Failed');
        }

        // Cleanup
        await prisma.sale.delete({ where: { id: sale.id } });

    } catch (error) {
        console.error('❌ Integration Test Failed:', JSON.stringify(error, null, 2));
        if (error.meta) console.error('Meta:', error.meta);
    } finally {
        await prisma.$disconnect();
    }
}

testIntegration();
