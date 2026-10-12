const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// Secure all endpoints
router.use(protect);

// Placeholder for future endpoints (e.g., delete message, update message content)

module.exports = router;
