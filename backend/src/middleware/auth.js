const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const { AppError, catchAsync } = require('./errorHandler');
const config = require('../config/config');
const logger = require('../utils/logger');

// Generate JWT token
const signToken = (id) => {
  return jwt.sign({ id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

// Create and send JWT token
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  
  // Remove password from output
  user.password = undefined;
  user.security = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        role: user.role,
        preferences: user.preferences,
        stats: user.stats
      }
    }
  });
};

// Verify JWT token and get user
const verifyToken = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, config.jwt.secret);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError('The user belonging to this token does no longer exist.', 401));
  }

  // 4) Check if user is active
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 401));
  }

  // 5) Check if user changed password after the token was issued
  if (currentUser.security.passwordChangedAt) {
    const changedTimestamp = parseInt(
      currentUser.security.passwordChangedAt.getTime() / 1000,
      10
    );

    if (decoded.iat < changedTimestamp) {
      return next(new AppError('User recently changed password! Please log in again.', 401));
    }
  }

  // 6) Update last active timestamp
  currentUser.stats.lastActive = new Date();
  await currentUser.save({ validateBeforeSave: false });

  // Grant access to protected route
  req.user = currentUser;
  next();
});

// Optional authentication - doesn't fail if no token
const optionalAuth = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = await promisify(jwt.verify)(token, config.jwt.secret);
      const currentUser = await User.findById(decoded.id);
      
      if (currentUser && currentUser.isActive) {
        req.user = currentUser;
        
        // Update last active
        currentUser.stats.lastActive = new Date();
        await currentUser.save({ validateBeforeSave: false });
      }
    } catch (error) {
      // Token invalid, but continue without user
      logger.warn('Invalid optional token:', { token: token.substr(0, 20) + '...', error: error.message });
    }
  }

  next();
});

// Restrict to certain roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

// Check if account is locked
const checkAccountLock = catchAsync(async (req, res, next) => {
  const { email, username } = req.body;
  
  if (!email && !username) {
    return next();
  }

  const user = await User.findByEmailOrUsername(email || username);
  
  if (user && user.security.isLocked) {
    const lockTimeLeft = Math.ceil((user.security.lockUntil - Date.now()) / 60000);
    
    logger.logSecurity('login_attempt_locked_account', {
      userId: user._id,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      lockTimeLeft
    });

    return next(new AppError(
      `Account temporarily locked due to too many failed login attempts. Try again in ${lockTimeLeft} minutes.`, 
      423
    ));
  }

  next();
});

// Rate limiting for authentication endpoints
const authRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.logSecurity('auth_rate_limit_exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });

    res.status(429).json({
      error: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
      retryAfter: 900 // 15 minutes in seconds
    });
  }
});

// Extension authentication (for anonymous usage)
const extensionAuth = catchAsync(async (req, res, next) => {
  const extensionVersion = req.get('X-Extension-Version');
  const sessionId = req.get('X-Session-ID');

  // Validate extension headers
  if (!extensionVersion) {
    return next(new AppError('Extension version required', 400));
  }

  // Store extension info for analytics
  req.extensionInfo = {
    version: extensionVersion,
    sessionId: sessionId,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  };

  next();
});

// Admin only access
const adminOnly = [verifyToken, restrictTo('admin')];

// Moderator or admin access
const moderatorOrAdmin = [verifyToken, restrictTo('moderator', 'admin')];

module.exports = {
  // Core auth functions
  signToken,
  createSendToken,
  verifyToken,
  optionalAuth,
  restrictTo,
  checkAccountLock,
  extensionAuth,

  // Middleware combinations
  required: verifyToken,
  optional: optionalAuth,
  admin: adminOnly,
  moderator: moderatorOrAdmin,
  
  // Rate limiting
  authRateLimit,
};