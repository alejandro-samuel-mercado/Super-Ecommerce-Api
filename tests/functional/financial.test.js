const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');

describe('Financial System Comprehensive Verification', () => {
    let adminToken;
    let customerToken;
    let categoryId;
    let productId;
    let skuId;
    let supplierId;
    let branchId = 1;
    let arsRate = 1.0;
    let usdRate = 1000.0; // 1 USD = 1000 ARS base

    const testAdmin = {
        email: 'admin_fin@example.com',
        password: 'Password123!',
        name: 'Admin Financial'
    };

    const testCustomer = {
        email: 'customer_fin@example.com',
        password: 'Password123!',
        name: 'Customer Financial'
    };

    before(async () => {
        // 1. Cleanup in correct order to avoid FK errors (The "Nuclear" Wipe)
        await prisma.userBranch.deleteMany({});
        await prisma.stockMovement.deleteMany({});
        await prisma.supplierPayment.deleteMany({});
        await prisma.purchaseItem.deleteMany({});
        await prisma.purchase.deleteMany({});
        await prisma.saleReceipt.deleteMany({});
        await prisma.paymentTransaction.deleteMany({});
        await prisma.stockReservation.deleteMany({});
        await prisma.saleItem.deleteMany({});
        await prisma.sale.deleteMany({});
        await prisma.stockTransferItem.deleteMany({});
        await prisma.stockTransfer.deleteMany({});
        await prisma.cartItem.deleteMany({});
        await prisma.variantOption.deleteMany({});
        await prisma.branchInventory.deleteMany({});
        await prisma.supplierSKU.deleteMany({});
        await prisma.sKU.deleteMany({});
        await prisma.productPrice.deleteMany({});
        await prisma.product.deleteMany({});
        await prisma.category.deleteMany({});
        await prisma.supplier.deleteMany({});
        await prisma.auditLog.deleteMany({});
        await prisma.pointsHistory.deleteMany({});
        await prisma.notification.deleteMany({});
        await prisma.chatMessage.deleteMany({});
        await prisma.chatConversation.deleteMany({});
        await prisma.accessLog.deleteMany({});
        await prisma.user.deleteMany({});
        await prisma.branch.deleteMany({});
        await prisma.role.deleteMany({});

        // 2. Setup Roles & Currencies
        const superAdminRole = await prisma.role.upsert({
            where: { name: 'SUPER_ADMIN' },
            update: {},
            create: { name: 'SUPER_ADMIN', description: 'Super Admin' }
        });
        const customerRole = await prisma.role.upsert({
            where: { name: 'CUSTOMER' },
            update: {},
            create: { name: 'CUSTOMER', description: 'Customer' }
        });

        await prisma.currency.upsert({ where: { code: 'ARS' }, update: { exchangeRateToBase: arsRate, isActive: true }, create: { code: 'ARS', symbol: '$', exchangeRateToBase: arsRate, isActive: true } });
        await prisma.currency.upsert({ where: { code: 'USD' }, update: { exchangeRateToBase: 1/usdRate, isActive: true }, create: { code: 'USD', symbol: 'U$S', exchangeRateToBase: 1/usdRate, isActive: true } });
        
        await prisma.storeConfig.upsert({
            where: { id: 1 },
            update: { baseCurrency: 'ARS', taxRate: 0 },
            create: { id: 1, baseCurrency: 'ARS', taxRate: 0 }
        });

        // 3. Create Users & Login
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('Password123!', 10);

        await prisma.user.upsert({
            where: { email: testAdmin.email },
            update: { password: hashedPassword, roleId: superAdminRole.id, status: 'ACTIVE', emailVerified: true },
            create: { ...testAdmin, password: hashedPassword, roleId: superAdminRole.id, status: 'ACTIVE', emailVerified: true }
        });
        await prisma.user.upsert({
            where: { email: testCustomer.email },
            update: { password: hashedPassword, roleId: customerRole.id, status: 'ACTIVE', emailVerified: true },
            create: { ...testCustomer, password: hashedPassword, roleId: customerRole.id, status: 'ACTIVE', emailVerified: true }
        });

        const adminLogin = await request(app).post('/api/auth/login').send({ email: testAdmin.email, password: testAdmin.password });
        if (!adminLogin.body.success) {
            console.error('Admin Login Failed:', JSON.stringify(adminLogin.body, null, 2));
            throw new Error('Admin Login Failed');
        }
        adminToken = adminLogin.body.data.tokens.accessToken;

        const customerLogin = await request(app).post('/api/auth/login').send({ email: testCustomer.email, password: testCustomer.password });
        if (!customerLogin.body.success) {
            console.error('Customer Login Failed:', JSON.stringify(customerLogin.body, null, 2));
            throw new Error('Customer Login Failed');
        }
        customerToken = customerLogin.body.data.tokens.accessToken;

        // 4. Setup Branch
        const branch = await prisma.branch.upsert({
            where: { code: 'HQ' },
            update: { isActive: true },
            create: { id: branchId, name: 'HG Branch', code: 'HQ', address: '...', city: '...', state: '...', phone: '...', operatingHours: {} }
        });
        branchId = branch.id;

        // 5. Setup Catalog & Supplier
        const cat = await prisma.category.create({ data: { name: 'Fin Test Cat', slug: 'fin-test-cat' } });
        categoryId = cat.id;

        const supplier = await prisma.supplier.create({
            data: { 
                tradeName: 'Fin Supplier', 
                legalName: 'Fin Supplier SA', 
                taxId: '123-' + Date.now(), 
                taxStatus: 'RI', 
                email: 's@s.com', 
                phone: '1',
                billingAddress: 'Test Address 123'
            }
        });
        supplierId = supplier.id;
    });

    after(async () => {
        await prisma.$disconnect();
    });

    test('End-to-End Financial Flow Simulation', async () => {
        // Step 1: Create Product
        const prodRes = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Financial Test Product',
                type: 'Simple',
                brand: 'BrandX',
                description: 'Tests margins',
                basePrice: 1000, // 1000 ARS
                categoryId: categoryId,
                skus: [{ code: 'FIN-TEST-SKU', price: 1000 }]
            });
        
        productId = prodRes.body.data.id;
        skuId = prodRes.body.data.skus[0].id;

        // Step 2: Supplier Purchase (Buy 10 units at 500 ARS each)
        // This sets the cost price
        const purchaseRes = await request(app)
            .post('/api/purchases')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                supplierId: supplierId,
                branchId: branchId,
                currencyCode: 'ARS',
                items: [{ skuId: skuId, quantity: 10, unitPrice: 500 }]
            });
        
        const purchaseId = purchaseRes.body.data.id;

        // Register Payment for Purchase (Expense)
        await request(app)
            .post('/api/supplier-payments')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                supplierId: supplierId,
                purchaseId: purchaseId,
                amount: 5000,
                method: 'TRANSFER',
                paymentDate: new Date()
            });

        // Receive Purchase (Enters Stock)
        await request(app)
            .post(`/api/purchases/${purchaseId}/receive`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send();

        // Step 3: ARS Sale (Sell 1 unit at 1000 ARS)
        const saleArsRes = await request(app)
            .post('/api/sales/checkout')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                items: [{ skuId: skuId, quantity: 1 }],
                paymentType: 'CASH',
                deliveryType: 'PICKUP',
                branchId: branchId
            });
        
        if (saleArsRes.status !== 201) {
            console.error('Sale ARS Failed:', JSON.stringify(saleArsRes.body, null, 2));
            throw new Error(`Sale ARS Failed with status ${saleArsRes.status}`);
        }
        
        const saleArsId = saleArsRes.body.data.id;
        // Mark as PAID to count in revenue
        await request(app)
            .put(`/api/sales/${saleArsId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ paymentStatus: 'PAID' });

        // Step 4: USD Sale (Sell 1 unit at 2 USD - Exchange rate 1000)
        // Total should be 2 USD = 2000 ARS base (approx, depending on how it handles rounding)
        const saleUsdRes = await request(app)
            .post('/api/sales/checkout')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                items: [{ skuId: skuId, quantity: 1 }],
                paymentType: 'CASH',
                deliveryType: 'PICKUP',
                branchId: branchId,
                currencyCode: 'USD' // Frontend sends currency
            });
        
        const saleUsdId = saleUsdRes.body.data.id;
        await request(app)
            .put(`/api/sales/${saleUsdId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ paymentStatus: 'PAID' });

        // Step 5: Refund ARS Sale
        await request(app)
            .post(`/api/sales/${saleArsId}/refund`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ reason: 'Test Refund' });

        // Step 6: Verify Final Report
        // Anticipated Metrics (Base ARS):
        // Revenue (Only USD Sale active): 2 USD * 1000 = 2000 ARS
        // Expenses (Supplier Payment): 5000 ARS
        // COGS (1 unit sold): 500 ARS
        // Net Profit: 2000 (Rev) - 5000 (Exp) - 500 (COGS) = -3500 ARS
        
        const today = new Date().toISOString().split('T')[0];
        const reportRes = await request(app)
            .get('/api/reports/financial-stats')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ startDate: today, endDate: today, branchId: branchId });

        const stats = reportRes.body.data;
        
        console.log('--- Financial Stats Result ---');
        console.log('Total Revenue (ARS Base):', stats.totalRevenueBase);
        console.log('Total Expenses (ARS Base):', stats.totalExpensesBase);
        console.log('Net Profit:', stats.netProfit);
        console.log('Margin:', stats.margin);

        // Assertions
        assert.strictEqual(Number(stats.totalRevenueBase), 2000, 'Revenue should be 2000 (from 2 USD sale)');
        assert.strictEqual(Number(stats.totalExpensesBase), 5000, 'Expenses should be 5000 (from supplier payment)');
        assert.strictEqual(Number(stats.netProfit), -3500, 'Net profit should be -3500 (2000 - 5000 - 500)');
    });
});
