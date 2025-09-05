const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const Analytics = require('../models/Analytics');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

const loginValidation = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or username is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Apply rate limiting to auth routes
router.use(authMiddleware.authRateLimit);

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', registerValidation, catchAsync(async (req, res, next) => {
  const { email, username, password, firstName, lastName } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    return next(new AppError('User already exists with this email or username', 400));
  }

  // Create new user
  const newUser = await User.create({
    email,
    username,
    password,
    profile: {
      firstName,
      lastName
    },
    stats: {
      joinedAt: new Date()
    }
  });

  // Log analytics
  await Analytics.recordEvent('user_registered', {
    platform: 'extension',
    userAgent: req.get('User-Agent'),
    ip: req.ip
  }, newUser._id);

  logger.info('New user registered:', {
    userId: newUser._id,
    username: newUser.username,
    email: newUser.email
  });

  // Create and send token
  authMiddleware.createSendToken(newUser, 201, res);
}));

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [authMiddleware.checkAccountLock, ...loginValidation], catchAsync(async (req, res, next) => {
  const { identifier, password } = req.body;

  // Find user by email or username
  const user = await User.findByEmailOrUsername(identifier);

  // Check if user exists and password is correct
  if (!user || !(await user.comparePassword(password))) {
    if (user) {
      await user.incrementLoginAttempts();
      
      logger.logSecurity('failed_login_attempt', {
        userId: user._id,
        identifier,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        attempts: user.security.loginAttempts + 1
      });
    }
    
    return next(new AppError('Incorrect email/username or password', 401));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated', 401));
  }

  // Reset login attempts on successful login
  if (user.security.loginAttempts > 0) {
    await user.resetLoginAttempts();
  }

  // Update login statistics
  await user.updateStats('session');

  logger.info('User logged in:', {
    userId: user._id,
    username: user.username,
    ip: req.ip
  });

  // Create and send token
  authMiddleware.createSendToken(user, 200, res);
}));

// @route   POST /api/auth/logout
// @desc    Logout user (mainly for analytics)
// @access  Private
router.post('/logout', authMiddleware.required, catchAsync(async (req, res, next) => {
  logger.info('User logged out:', {
    userId: req.user._id,
    username: req.user.username
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
}));

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authMiddleware.required, catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id)
    .select('-security.twoFactorSecret');

  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
}));

// @route   PUT /api/auth/password
// @desc    Update password
// @access  Private
router.put('/password', [
  authMiddleware.required,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Verify current password
  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect', 400));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  logger.info('Password updated:', {
    userId: user._id,
    username: user.username
  });

  res.status(200).json({
    status: 'success',
    message: 'Password updated successfully'
  });
}));

// @route   DELETE /api/auth/account
// @desc    Delete user account
// @access  Private
router.delete('/account', authMiddleware.required, catchAsync(async (req, res, next) => {
  // Deactivate account instead of hard delete for data integrity
  await User.findByIdAndUpdate(req.user._id, {
    isActive: false,
    email: `deleted_${Date.now()}_${req.user.email}`,
    username: `deleted_${Date.now()}_${req.user.username}`
  });

  logger.info('User account deleted:', {
    userId: req.user._id,
    username: req.user.username
  });

  res.status(200).json({
    status: 'success',
    message: 'Account deleted successfully'
  });
}));

module.exports = router;