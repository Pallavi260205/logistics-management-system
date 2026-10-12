const express = require('express');
const router = express.Router();
const { getUserProfile, updateUserProfile, getUsers, getUserById } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { profileValidation } = require('../middleware/validationMiddleware');

// Secure all endpoints under /api/users
router.use(protect);

router.route('/profile')
  .get(getUserProfile)
  .put(profileValidation, updateUserProfile);

router.get('/', getUsers);
router.get('/:id', getUserById);

module.exports = router;
