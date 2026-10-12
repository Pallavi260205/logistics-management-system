const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect REST API routes
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey12345');

      req.user = await User.findById(decoded.id);

      if (!req.user) {
        res.status(401);
        return next(new Error('Not authorized, user not found'));
      }

      return next();
    } catch (error) {
      console.error('JWT Verification Error:', error.message);
      res.status(401);
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Not authorized, token expired'));
      }
      return next(new Error('Not authorized, token invalid'));
    }
  }

  if (!token) {
    res.status(401);
    return next(new Error('Not authorized, no token provided'));
  }
};

// Protect Socket.IO connections
const socketAuth = async (socket, next) => {
  // Extract token from auth payload or headers
  const token = socket.handshake.auth?.token || socket.handshake.headers['authorization']?.split(' ')[1];

  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey12345');
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket JWT Error:', error.message);
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Authentication error: Token expired'));
    }
    return next(new Error('Authentication error: Invalid token'));
  }
};

module.exports = { protect, socketAuth };
