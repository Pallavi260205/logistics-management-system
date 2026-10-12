const express = require('express');
const router = express.Router();
const { getConversations, createOrFindConversation } = require('../controllers/chatController');
const { getMessages } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// Secure all chat routes
router.use(protect);

router.route('/')
  .get(getConversations)
  .post(createOrFindConversation);

router.get('/:conversationId/messages', getMessages);

module.exports = router;
