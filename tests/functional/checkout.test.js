const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');

describe('Checkout Functional Tests', () => {
  let token;
  let skuId;
  let categoryId;
  let productId;
  let sucursalId = 1;

  const testUser = {
    email: 'test_functional_checkout@example.com',
    password: 'Password123!',
    name: 'Test Checkout User'
  };

  const testProduct = {
    name: 'Test Product Functional',
    price: 1000
  };

  before(async () => {
   
    // 1. Clean up deep dependencies
    const testUserRecord = await prisma.user.findUnique({ where: { email: testUser.email } });
    if (testUserRecord) {
        const userSales = await prisma.sale.findMany({ where: { userId: testUserRecord.id }, select: { id: true } });
        const saleIds = userSales.map(s => s.id);
        
        await prisma.saleReceipt.deleteMany({ where: { saleId: { in: saleIds } } });
        await prisma.paymentTransaction.deleteMany({ where: { saleId: { in: saleIds } } });
        await prisma.stockReservation.deleteMany({ where: { saleId: { in: saleIds } } });
        await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
        await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
        await prisma.user.deleteMany({ where: { id: testUserRecord.id } });
    }

    await prisma.stockMovement.deleteMany({ where: { sku: { product: { name: testProduct.name } } } });
    await prisma.branchInventory.deleteMany({ where: { sku: { product: { name: testProduct.name } } } });
    await prisma.sKU.deleteMany({ where: { product: { name: testProduct.name } } });
    await prisma.product.deleteMany({ where: { name: testProduct.name } });

    // Ensure Role CUSTOMER exists
    await prisma.role.upsert({
        where: { name: 'CUSTOMER' },
        update: {},
        create: { name: 'CUSTOMER', description: 'Customer Role' }
    });

    // 2. Register & Login
    await request(app).post('/api/auth/register').send(testUser);
    const loginRes = await request(app).post('/api/auth/login').send({ email: testUser.email, password: testUser.password });
    token = loginRes.body.data.tokens.accessToken;

    // 3. Setup Product & Stock
    // Ensure Category
    const category = await prisma.category.upsert({
      where: { slug: 'test-cat' },
      update: {},
      create: { name: 'Test Cat', slug: 'test-cat', description: 'Test' }
    });
    categoryId = category.id;

    // Create Product
    const product = await prisma.product.create({
      data: {
        name: testProduct.name,
        type: 'Test',
        brand: 'TestBrand',
        model: 'T1',
        description: 'Desc',
        basePrice: testProduct.price,
        categoryId: category.id,
        isActive: true
      }
    });
    productId = product.id;

    // Create SKU
    const sku = await prisma.sKU.create({
      data: {
        productId: product.id,
        code: 'TEST-SKU-FUNC-1',
        price: testProduct.price,
        stock: 100
      }
    });
    skuId = sku.id;

    // Create BranchInventory
    await prisma.sucursal.upsert({
        where: { id: sucursalId },
        update: {},
        create: { 
            id: sucursalId, 
            name: 'Main Branch', 
            code: 'MAIN', 
            address: 'Main St',
            city: 'Test City',
            state: 'Test State',
            phone: '123456789',
            operatingHours: { monday: '09:00-18:00' }
        }
    });

    await prisma.branchInventory.create({
        data: {
            skuId: sku.id,
            sucursalId: sucursalId,
            stock: 50,
            price: testProduct.price,
            isActive: true
        }
    });
  });

  after(async () => {
    // Clean up
    if (skuId) {
         try {
         
         } catch(e) {}
    }
    await prisma.$disconnect();
  });

  test('POST /api/sales/checkout - Should create a sale and deduct stock', async () => {
    const saleData = {
      items: [
        { skuId: skuId, quantity: 2 }
      ],
      paymentType: 'EFECTIVO', 
      deliveryType: 'LOCAL',
      sucursalId: sucursalId
    };

    const response = await request(app)
      .post('/api/sales/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send(saleData)
      .expect('Content-Type', /json/)
      .expect(201);

    assert.strictEqual(response.body.success, true);
    assert.strictEqual(Number(response.body.data.total), testProduct.price * 2 * 1.21); 
    assert.ok(response.body.data.id);

    // Verify Stock Deduction
    const inventory = await prisma.branchInventory.findUnique({
        where: { skuId_sucursalId: { skuId: skuId, sucursalId: sucursalId } }
    });
    assert.strictEqual(inventory.stock, 48); 
  });
});
