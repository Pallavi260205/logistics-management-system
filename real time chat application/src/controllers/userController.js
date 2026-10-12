const User = require('../models/User');

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          profileInfo: user.profileInfo,
          isOnline: user.isOnline,
          lastSeen: user.lastSeen,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } else {
      res.status(404);
      return next(new Error('User not found'));
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      if (req.body.profileInfo) {
        user.profileInfo.avatar = req.body.profileInfo.avatar !== undefined ? req.body.profileInfo.avatar : user.profileInfo.avatar;
        user.profileInfo.bio = req.body.profileInfo.bio !== undefined ? req.body.profileInfo.bio : user.profileInfo.bio;
      }

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.status(200).json({
        success: true,
        data: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          profileInfo: updatedUser.profileInfo,
          isOnline: updatedUser.isOnline,
          lastSeen: updatedUser.lastSeen,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        },
      });
    } else {
      res.status(404);
      return next(new Error('User not found'));
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users (with optional query search)
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res, next) => {
  try {
    const keyword = req.query.search
      ? {
          $and: [
            {
              $or: [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
              ],
            },
            { _id: { $ne: req.user._id } },
          ],
        }
      : { _id: { $ne: req.user._id } };

    const users = await User.find(keyword);
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      res.status(200).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          profileInfo: user.profileInfo,
          isOnline: user.isOnline,
          lastSeen: user.lastSeen,
        },
      });
    } else {
      res.status(404);
      return next(new Error('User not found'));
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getUsers,
  getUserById,
};
