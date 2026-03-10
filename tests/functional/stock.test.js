const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');

describe('Stock Functional Tests', () => {
  let token;
  let skuId;
  let sucursalId = 1;

  const uniqueId = Date.now();
  const testUser = {
    email: `test_functional_stock_${uniqueId}@example.com`,
    password: 'Password123!',
    name: 'Stock User'
  };

  before(async () => {
    // 1. Clean up & Setup User
    try {
       await prisma.saleItem.deleteMany({ where: { sku: { code: 'LOW-STOCK-SKU' } } });
       await prisma.stockMovement.deleteMany({ where: { sku: { code: 'LOW-STOCK-SKU' } } });
       await prisma.branchInventory.deleteMany({ where: { sku: { code: 'LOW-STOCK-SKU' } } });
       
       await prisma.sKU.deleteMany({ where: { code: 'LOW-STOCK-SKU' } });
       await prisma.product.deleteMany({ where: { name: 'Low Stock Product' } });

       const cat = await prisma.category.findUnique({ where: { slug: 'stock-test-cat' } });
       if (cat) {
           await prisma.product.deleteMany({ where: { categoryId: cat.id } }); 
           await prisma.category.delete({ where: { id: cat.id } });
       }

       await prisma.user.deleteMany({ where: { email: testUser.email } });
    } catch(e) {}


    // Ensure Role CUSTOMER exists
    await prisma.role.upsert({
        where: { name: 'CUSTOMER' },
        update: {},
        create: { name: 'CUSTOMER', description: 'Customer Role' }
    });

    // 2. Register & Login
    const registerRes = await request(app).post('/api/auth/register').send(testUser);
    if (registerRes.status !== 201) {
         if (registerRes.status !== 409) {
             throw new Error(`Register Failed in Test: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
         }
    }
    const loginRes = await request(app).post('/api/auth/login').send({ email: testUser.email, password: testUser.password });
    if (!loginRes.body.data || !loginRes.body.data.tokens || !loginRes.body.data.tokens.accessToken) {
        throw new Error(`Login Failed in Test: ${JSON.stringify(loginRes.body)}`);
    }
    token = loginRes.body.data.tokens.accessToken;

    const category = await prisma.category.upsert({
      where: { slug: 'stock-test-cat' },
      update: {},
      create: { name: 'Stock Test Cat', slug: 'stock-test-cat', description: 'Test' }
    });

    // 3. Setup Product with Low Stock
    const product = await prisma.product.create({
      data: {
        name: 'Low Stock Product',
        type: 'Test',
        brand: 'Test',
        basePrice: 100,
        categoryId: category.id,
        description: 'Low stock test description',
        isActive: true
      }
    });

    const sku = await prisma.sKU.create({
      data: {
        productId: product.id,
        code: 'LOW-STOCK-SKU',
        price: 100,
        stock: 5 
      }
    });
    skuId = sku.id;
    
    // Ensure Branch Inventory
    await prisma.branchInventory.upsert({
        where: { skuId_sucursalId: { skuId: sku.id, sucursalId } },
        update: { stock: 5, isActive: true },
        create: { skuId: sku.id, sucursalId: sucursalId, stock: 5, price: 100, isActive: true }
    });
  });

  after(async () => {
     try {
       await prisma.sKU.deleteMany({ where: { code: 'LOW-STOCK-SKU' } });
       await prisma.product.deleteMany({ where: { name: 'Low Stock Product' } });
       await prisma.user.deleteMany({ where: { email: testUser.email } });
       await prisma.category.deleteMany({ where: { slug: 'stock-test-cat' } });
     } catch (e) {}
     await prisma.$disconnect();
  });

  test('Should fail when buying more than available stock', async () => {
    const saleData = {
      items: [
        { skuId: skuId, quantity: 10 } 
      ],
      paymentType: 'EFECTIVO',
      deliveryType: 'LOCAL',
      sucursalId: sucursalId
    };

    const response = await request(app)
      .post('/api/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send(saleData);

    if (response.status !== 400) {
        console.error('Checkout Failed with unexpected status:', response.status, response.body);
    }
    
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.success, false);
    assert.match(response.body.message, /stock/i);
  });
});
