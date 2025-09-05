const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },
  
  // Session identification
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Problem context
  problem: {
    title: { type: String, required: true },
    platform: {
      type: String,
      required: true,
      enum: ['leetcode', 'codeforces', 'codechef', 'hackerrank']
    },
    url: String,
    difficulty: String,
    category: String,
    statement: String, // Truncated version for context
  },
  
  // Session data
  hints: [{
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    userCode: String, // Code at the time of hint request
    codeLength: Number,
    responseTime: Number, // AI response time in ms
    helpful: Boolean, // User feedback
  }],
  
  codeAnalyses: [{
    code: { type: String, required: true },
    analysis: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    codeLanguage: String,
    issues: [String], // Detected issues
    suggestions: [String], // Improvement suggestions
    complexity: {
      time: String,
      space: String
    },
    helpful: Boolean, // User feedback
  }],
  
  // Session metrics
  metrics: {
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    duration: Number, // in seconds
    hintsRequested: { type: Number, default: 0 },
    analysesRequested: { type: Number, default: 0 },
    codeSubmissions: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
  },
  
  // User interaction
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    helpful: Boolean,
    submittedAt: Date,
  },
  
  // Technical metadata
  metadata: {
    userAgent: String,
    ipAddress: String,
    extensionVersion: String,
    browserVersion: String,
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned', 'error'],
    default: 'active'
  },
  
  isActive: { type: Boolean, default: true },
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
sessionSchema.index({ userId: 1, createdAt: -1 });
sessionSchema.index({ 'problem.platform': 1, createdAt: -1 });
sessionSchema.index({ status: 1, createdAt: -1 });
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // Auto-delete after 30 days

// Virtual for session duration
sessionSchema.virtual('sessionDuration').get(function() {
  if (this.metrics.endTime) {
    return Math.round((this.metrics.endTime - this.metrics.startTime) / 1000);
  }
  return Math.round((Date.now() - this.metrics.startTime) / 1000);
});

// Virtual for total interactions
sessionSchema.virtual('totalInteractions').get(function() {
  return this.hints.length + this.codeAnalyses.length;
});

// Instance method to add hint
sessionSchema.methods.addHint = function(hintData) {
  this.hints.push(hintData);
  this.metrics.hintsRequested = this.hints.length;
  this.markModified('hints');
  this.markModified('metrics');
  return this.save();
};

// Instance method to add code analysis
sessionSchema.methods.addCodeAnalysis = function(analysisData) {
  this.codeAnalyses.push(analysisData);
  this.metrics.analysesRequested = this.codeAnalyses.length;
  this.markModified('codeAnalyses');
  this.markModified('metrics');
  return this.save();
};

// Instance method to end session
sessionSchema.methods.endSession = function(completed = false) {
  this.metrics.endTime = new Date();
  this.metrics.duration = this.sessionDuration;
  this.metrics.completed = completed;
  this.status = completed ? 'completed' : 'abandoned';
  this.isActive = false;
  return this.save();
};

// Instance method to add feedback
sessionSchema.methods.addFeedback = function(feedbackData) {
  this.feedback = {
    ...feedbackData,
    submittedAt: new Date()
  };
  return this.save();
};

// Static method to get user session history
sessionSchema.statics.getUserSessions = function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username profile.firstName profile.lastName')
    .select('-hints.userCode -codeAnalyses.code'); // Exclude code for privacy
};

// Static method to get platform statistics
sessionSchema.statics.getPlatformStats = function(timeRange = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeRange);
  
  return this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: '$problem.platform',
        sessions: { $sum: 1 },
        totalHints: { $sum: '$metrics.hintsRequested' },
        totalAnalyses: { $sum: '$metrics.analysesRequested' },
        avgDuration: { $avg: '$metrics.duration' },
        completedSessions: {
          $sum: { $cond: [{ $eq: ['$metrics.completed', true] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        platform: '$_id',
        sessions: 1,
        totalHints: 1,
        totalAnalyses: 1,
        avgDuration: { $round: ['$avgDuration', 2] },
        completedSessions: 1,
        completionRate: {
          $round: [{ $multiply: [{ $divide: ['$completedSessions', '$sessions'] }, 100] }, 2]
        }
      }
    }
  ]);
};

// Static method to clean up old active sessions
sessionSchema.statics.cleanupAbandonedSessions = function() {
  const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  
  return this.updateMany(
    {
      status: 'active',
      createdAt: { $lt: cutoffTime }
    },
    {
      status: 'abandoned',
      isActive: false
    }
  );
};

module.exports = mongoose.model('Session', sessionSchema);