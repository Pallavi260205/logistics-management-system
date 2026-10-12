const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const socketio = require('socket.io');
const ioClient = require('socket.io-client');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const User = require('../src/models/User');
const socketHandler = require('../src/socket/socketHandler');

const MONGO_TEST_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chat-app-test';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey12345';

test.describe('Socket.IO Integration Tests', () => {
  let server;
  let port;
  let userA, userB;
  let tokenA, tokenB;
  let clientSocketA, clientSocketB;

  test.before(async () => {
    try {
      await mongoose.connect(MONGO_TEST_URI);
      await User.deleteMany({ email: /test_socket_.*@example.com/ });
    } catch (err) {
      console.error('Socket Test DB Error:', err.message);
    }

    userA = await User.create({
      name: 'User A',
      email: `test_socket_a_${Date.now()}@example.com`,
      password: 'password123',
    });
    userB = await User.create({
      name: 'User B',
      email: `test_socket_b_${Date.now()}@example.com`,
      password: 'password123',
    });

    tokenA = jwt.sign({ id: userA._id }, JWT_SECRET, { expiresIn: '1d' });
    tokenB = jwt.sign({ id: userB._id }, JWT_SECRET, { expiresIn: '1d' });

    server = http.createServer(app);
    const ioServer = socketio(server);
    app.set('io', ioServer);
    socketHandler(ioServer);

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  test.after(async () => {
    if (clientSocketA && clientSocketA.connected) clientSocketA.disconnect();
    if (clientSocketB && clientSocketB.connected) clientSocketB.disconnect();

    await new Promise((resolve) => server.close(resolve));

    try {
      await User.deleteMany({ email: /test_socket_.*@example.com/ });
      await mongoose.connection.close();
    } catch (err) {
      console.error('Cleanup Error:', err.message);
    }
  });

  test('Connect Socket.IO client with valid JWT', () => {
    return new Promise((resolve, reject) => {
      clientSocketA = ioClient(`http://localhost:${port}`, {
        auth: { token: tokenA },
        transports: ['websocket'],
      });

      clientSocketA.on('connect', () => {
        assert.ok(clientSocketA.connected);
        resolve();
      });

      clientSocketA.on('connect_error', (err) => {
        reject(err);
      });
    });
  });

  test('Should reject connection with invalid JWT', () => {
    return new Promise((resolve, reject) => {
      const badSocket = ioClient(`http://localhost:${port}`, {
        auth: { token: 'invalid_token' },
        transports: ['websocket'],
      });

      badSocket.on('connect', () => {
        badSocket.disconnect();
        reject(new Error('Should not have connected with invalid token'));
      });

      badSocket.on('connect_error', (err) => {
        assert.match(err.message, /Authentication error/i);
        badSocket.disconnect();
        resolve();
      });
    });
  });

  test('Real-time Messaging and Status updates', () => {
    return new Promise((resolve, reject) => {
      clientSocketB = ioClient(`http://localhost:${port}`, {
        auth: { token: tokenB },
        transports: ['websocket'],
      });

      clientSocketB.on('connect', () => {
        clientSocketB.on('receive_message', (message) => {
          assert.strictEqual(message.content, 'Hello User B!');
          assert.strictEqual(message.senderId._id, userA._id.toString());
          
          clientSocketB.emit('mark_seen', {
            conversationId: message.conversationId,
          });
        });

        clientSocketA.on('messages_seen', (data) => {
          assert.strictEqual(data.seenBy, userB._id.toString());
          resolve();
        });

        clientSocketA.emit(
          'send_message',
          {
            receiverId: userB._id.toString(),
            content: 'Hello User B!',
          },
          (ack) => {
            assert.strictEqual(ack.success, true);
            assert.strictEqual(ack.data.content, 'Hello User B!');
          }
        );
      });

      clientSocketB.on('connect_error', (err) => {
        reject(err);
      });
    });
  });

  test('Typing indicator events forwarding', () => {
    return new Promise((resolve, reject) => {
      clientSocketB.on('user_typing', (data) => {
        assert.strictEqual(data.userId, userA._id.toString());
        resolve();
      });

      clientSocketA.emit('typing', {
        conversationId: new mongoose.Types.ObjectId().toString(),
        receiverId: userB._id.toString(),
      });
    });
  });
});
