const { validationResult, check } = require('express-validator');

// General request validator handler
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array().map(err => err.msg).join(', '),
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// User registration rules
const registerValidation = [
  check('name', 'Name is required').notEmpty().trim(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
  validateRequest
];

// User login rules
const loginValidation = [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').notEmpty(),
  validateRequest
];

// Profile update rules
const profileValidation = [
  check('name', 'Name cannot be empty').optional().notEmpty().trim(),
  check('bio', 'Bio can be at most 200 characters').optional().isLength({ max: 200 }),
  validateRequest
];

module.exports = {
  validateRequest,
  registerValidation,
  loginValidation,
  profileValidation
};
