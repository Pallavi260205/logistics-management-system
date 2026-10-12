const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');

const MONGO_TEST_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chat-app-test';

test.describe('REST API Integration Tests', () => {
  let token;
  let testUserId;
  const testUserEmail = `test_${Date.now()}@example.com`;

  // Connect to a test database before running tests
  test.before(async () => {
    try {
      await mongoose.connect(MONGO_TEST_URI);
      // Clean up previous test users if any
      await User.deleteMany({ email: /test_.*@example.com/ });
    } catch (err) {
      console.error('Test DB Connection Error:', err.message);
    }
  });

  // Disconnect from database and clean up after running tests
  test.after(async () => {
    try {
      await User.deleteMany({ email: /test_.*@example.com/ });
      await mongoose.connection.close();
    } catch (err) {
      console.error('Cleanup Error:', err.message);
    }
  });

  test('GET /health - should return 200 health status', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Server is healthy');
  });

  test('GET / - should return 200 health status', async () => {
    const res = await request(app)
      .get('/')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Real-Time Chat Application Backend is running');
  });

  test('GET /health/status - should return 200 status with details', async () => {
    const res = await request(app)
      .get('/health/status')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, 'healthy');
    assert.strictEqual(res.body.message, 'Real-Time Chat Application Backend is running');
    assert.ok(res.body.timestamp);
    assert.ok(res.body.uptime);
  });

  test('POST /api/auth/register - should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: testUserEmail,
        password: 'password123',
      })
      .expect(201);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.name, 'Test User');
    assert.strictEqual(res.body.data.email, testUserEmail);
    assert.ok(res.body.data.token);
    assert.strictEqual(res.body.data.password, undefined); // Ensure password is not returned
    
    token = res.body.data.token;
    testUserId = res.body.data._id;
  });

  test('POST /api/auth/register - should fail with duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Another User',
        email: testUserEmail,
        password: 'password123',
      })
      .expect(400);

    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /exists/i);
  });

  test('POST /api/auth/login - should login user with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUserEmail,
        password: 'password123',
      })
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.strictEqual(res.body.data.isOnline, true);
  });

  test('POST /api/auth/login - should fail with incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUserEmail,
        password: 'wrongpassword',
      })
      .expect(401);

    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /invalid/i);
  });

  test('GET /api/users/profile - should block unauthorized access (no token)', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .expect(401);

    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /no token/i);
  });

  test('GET /api/users/profile - should fetch user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.email, testUserEmail);
  });
});
