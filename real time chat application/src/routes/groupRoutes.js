const express = require('express');
const router = express.Router();
const {
  createGroup,
  getGroups,
  getGroupById,
  addMembers,
  removeMember,
  sendGroupMessageREST,
  getGroupMessages,
} = require('../controllers/groupController');
const { protect } = require('../middleware/authMiddleware');

// Secure all group endpoints
router.use(protect);

router.route('/')
  .post(createGroup)
  .get(getGroups);

router.get('/:id', getGroupById);

router.post('/:id/members', addMembers);
router.delete('/:id/members/:userId', removeMember);

router.route('/:id/messages')
  .post(sendGroupMessageREST)
  .get(getGroupMessages);

module.exports = router;
