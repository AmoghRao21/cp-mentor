const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/config');

const userSchema = new mongoose.Schema({
  // Basic Info
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens']
  },
  
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Don't include password in queries by default
  },
  
  // Profile
  profile: {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    avatar: { type: String },
    bio: { type: String, maxlength: 500 },
    country: { type: String },
    timezone: { type: String },
  },
  
  // Platform Profiles
  platforms: {
    leetcode: {
      username: String,
      verified: { type: Boolean, default: false },
      rating: Number,
      problemsSolved: Number,
    },
    codeforces: {
      username: String,
      verified: { type: Boolean, default: false },
      rating: Number,
      rank: String,
    },
    codechef: {
      username: String,
      verified: { type: Boolean, default: false },
      rating: Number,
      stars: Number,
    }
  },
  
  // Usage Statistics
  stats: {
    hintsRequested: { type: Number, default: 0 },
    codeAnalyzed: { type: Number, default: 0 },
    problemsHelped: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 },
    lastActive: Date,
    joinedAt: { type: Date, default: Date.now },
  },
  
  // Preferences
  preferences: {
    hintStyle: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'intermediate'
    },
    platforms: [{
      type: String,
      enum: ['leetcode', 'codeforces', 'codechef']
    }],
    notifications: {
      email: { type: Boolean, default: true },
      browser: { type: Boolean, default: true },
      hints: { type: Boolean, default: true },
      updates: { type: Boolean, default: true },
    },
    privacy: {
      shareStats: { type: Boolean, default: false },
      publicProfile: { type: Boolean, default: false },
    }
  },
  
  // Security
  security: {
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    passwordChangedAt: Date,
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
  },
  
  // Subscription (for future premium features)
  subscription: {
    tier: {
      type: String,
      enum: ['free', 'premium', 'pro'],
      default: 'free'
    },
    validUntil: Date,
    stripeCustomerId: String,
  },
  
  // Admin
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'stats.lastActive': -1 });
userSchema.index({ 'subscription.tier': 1, 'subscription.validUntil': 1 });

// Virtual for full name
userSchema.virtual('profile.fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.username;
});

// Virtual for account lock status
userSchema.virtual('security.isLocked').get(function() {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  // Only hash password if it's been modified
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    this.password = await bcrypt.hash(this.password, config.security.bcryptRounds);
    this.security.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
userSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'security.lockUntil': 1 },
      $set: { 'security.loginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'security.loginAttempts': 1 } };
  
  // Lock account after max attempts
  if (this.security.loginAttempts + 1 >= config.security.maxLoginAttempts && !this.security.isLocked) {
    updates.$set = { 'security.lockUntil': Date.now() + config.security.lockoutTime };
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { 
      'security.loginAttempts': 1, 
      'security.lockUntil': 1 
    }
  });
};

// Instance method to update usage stats
userSchema.methods.updateStats = function(operation) {
  const updates = {
    'stats.lastActive': new Date()
  };
  
  switch(operation) {
    case 'hint':
      updates['stats.hintsRequested'] = (this.stats.hintsRequested || 0) + 1;
      break;
    case 'analyze':
      updates['stats.codeAnalyzed'] = (this.stats.codeAnalyzed || 0) + 1;
      break;
    case 'session':
      updates['stats.totalSessions'] = (this.stats.totalSessions || 0) + 1;
      break;
  }
  
  return this.updateOne(updates);
};

// Static method to find by email or username
userSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ]
  }).select('+password +security.loginAttempts +security.lockUntil');
};

// Static method for getting user statistics
userSchema.statics.getGlobalStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: {
            $cond: [
              { $gte: ['$stats.lastActive', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
              1,
              0
            ]
          }
        },
        totalHints: { $sum: '$stats.hintsRequested' },
        totalAnalyses: { $sum: '$stats.codeAnalyzed' }
      }
    }
  ]);
};

module.exports = mongoose.model('User', userSchema);