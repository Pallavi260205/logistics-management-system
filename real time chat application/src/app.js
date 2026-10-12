const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Standard health check and base routes
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Real-Time Chat Application Backend is running'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy'
  });
});

app.get('/health/status', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    message: 'Real-Time Chat Application Backend is running',
    timestamp: new Date(),
    uptime: `${Math.floor(process.uptime())}s`
  });
});

// Import routes (uncommented during route implementation)
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const groupRoutes = require('./routes/groupRoutes');
const messageRoutes = require('./routes/messageRoutes');

// Bind routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);

// Error handler middleware
const { errorHandler } = require('./middleware/errorMiddleware');
app.use(errorHandler);

module.exports = app;
