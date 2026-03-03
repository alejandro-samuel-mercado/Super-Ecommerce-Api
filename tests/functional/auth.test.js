const { test, describe,  before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');

describe('Auth Functional Tests', () => {
  const testUser = {
    email: 'test_functional_auth@example.com',
    password: 'Password123!',
    name: 'Test Auth User'
  };

  before(async () => {
    // Clean up
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    
    // Ensure Role CUSTOMER exists (Seed might have failed)
    await prisma.role.upsert({
        where: { name: 'CUSTOMER' },
        update: {},
        create: { name: 'CUSTOMER', description: 'Customer Role' }
    });
  });

  after(async () => {
    // Clean up
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await prisma.$disconnect();
  });

  test('POST /api/auth/register - Should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(testUser)
      .expect('Content-Type', /json/)
      .expect(201);

    assert.strictEqual(response.body.success, true);
    assert.ok(response.body.data.tokens.accessToken);
    assert.strictEqual(response.body.data.user.email, testUser.email);
  });

  test('POST /api/auth/login - Should login and return token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect('Content-Type', /json/)
      .expect(200);

    assert.strictEqual(response.body.success, true);
    assert.ok(response.body.data.tokens.accessToken);
  });
});
