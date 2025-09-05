const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  // Event identification
  eventType: {
    type: String,
    required: true,
    enum: [
      'hint_requested',
      'code_analyzed', 
      'session_started',
      'session_completed',
      'user_registered',
      'extension_installed',
      'feedback_submitted',
      'error_occurred'
    ],
    index: true
  },
  
  // User context
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    index: true
  },
  
  // Event data
  data: {
    // Problem context
    platform: {
      type: String,
      enum: ['leetcode', 'codeforces', 'codechef', 'hackerrank']
    },
    problemTitle: String,
    problemDifficulty: String,
    problemCategory: String,
    
    // User interaction
    hintNumber: Number, // Which hint in sequence
    codeLength: Number,
    responseTime: Number, // AI response time
    userAction: String, // What triggered the event
    
    // Technical metrics
    processingTime: Number,
    aiProvider: String,
    errorCode: String,
    errorMessage: String,
    
    // User feedback
    rating: Number,
    helpful: Boolean,
    
    // Additional metadata
    extensionVersion: String,
    browserVersion: String,
    userAgent: String,
  },
  
  // Geographic and technical info
  metadata: {
    ipAddress: String,
    country: String,
    city: String,
    timezone: String,
    language: String,
  },
  
  // Timestamps
  timestamp: { type: Date, default: Date.now, index: true },
  
}, {
  timestamps: false, // We use custom timestamp
  capped: { size: 50000000, max: 1000000 } // 50MB cap, max 1M documents
});

// Compound indexes for efficient queries
analyticsSchema.index({ eventType: 1, timestamp: -1 });
analyticsSchema.index({ userId: 1, timestamp: -1 });
analyticsSchema.index({ 'data.platform': 1, timestamp: -1 });
analyticsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // Auto-delete after 90 days

// Static method to record event
analyticsSchema.statics.recordEvent = function(eventType, data = {}, userId = null, sessionId = null) {
  return this.create({
    eventType,
    userId,
    sessionId,
    data,
    metadata: {
      ipAddress: data.ipAddress,
      country: data.country,
      userAgent: data.userAgent,
      extensionVersion: data.extensionVersion,
    }
  });
};

// Static method to get daily statistics
analyticsSchema.statics.getDailyStats = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          eventType: '$eventType'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        events: {
          $push: {
            type: '$_id.eventType',
            count: '$count'
          }
        },
        totalEvents: { $sum: '$count' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

// Static method to get platform usage statistics
analyticsSchema.statics.getPlatformUsage = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { 
      $match: { 
        timestamp: { $gte: startDate },
        'data.platform': { $exists: true }
      } 
    },
    {
      $group: {
        _id: '$data.platform',
        sessions: { $sum: { $cond: [{ $eq: ['$eventType', 'session_started'] }, 1, 0] } },
        hints: { $sum: { $cond: [{ $eq: ['$eventType', 'hint_requested'] }, 1, 0] } },
        analyses: { $sum: { $cond: [{ $eq: ['$eventType', 'code_analyzed'] }, 1, 0] } },
        avgResponseTime: { $avg: '$data.responseTime' },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        platform: '$_id',
        sessions: 1,
        hints: 1,
        analyses: 1,
        avgResponseTime: { $round: ['$avgResponseTime', 2] },
        uniqueUsers: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { sessions: -1 } }
  ]);
};

// Static method to get performance metrics
analyticsSchema.statics.getPerformanceMetrics = function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { 
      $match: { 
        timestamp: { $gte: startDate },
        'data.responseTime': { $exists: true }
      } 
    },
    {
      $group: {
        _id: '$eventType',
        avgResponseTime: { $avg: '$data.responseTime' },
        minResponseTime: { $min: '$data.responseTime' },
        maxResponseTime: { $max: '$data.responseTime' },
        totalRequests: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ['$eventType', 'error_occurred'] }, 1, 0] } }
      }
    },
    {
      $project: {
        eventType: '$_id',
        avgResponseTime: { $round: ['$avgResponseTime', 2] },
        minResponseTime: 1,
        maxResponseTime: 1,
        totalRequests: 1,
        errors: 1,
        successRate: {
          $round: [
            { $multiply: [{ $divide: [{ $subtract: ['$totalRequests', '$errors'] }, '$totalRequests'] }, 100] }, 
            2
          ]
        }
      }
    }
  ]);
};

// Static method to get user engagement metrics
analyticsSchema.statics.getUserEngagement = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { $match: { timestamp: { $gte: startDate }, userId: { $exists: true } } },
    {
      $group: {
        _id: '$userId',
        sessions: { $sum: { $cond: [{ $eq: ['$eventType', 'session_started'] }, 1, 0] } },
        hints: { $sum: { $cond: [{ $eq: ['$eventType', 'hint_requested'] }, 1, 0] } },
        analyses: { $sum: { $cond: [{ $eq: ['$eventType', 'code_analyzed'] }, 1, 0] } },
        lastActivity: { $max: '$timestamp' },
        firstActivity: { $min: '$timestamp' }
      }
    },
    {
      $match: { sessions: { $gt: 0 } } // Only users with at least one session
    },
    {
      $group: {
        _id: null,
        totalActiveUsers: { $sum: 1 },
        avgSessionsPerUser: { $avg: '$sessions' },
        avgHintsPerUser: { $avg: '$hints' },
        avgAnalysesPerUser: { $avg: '$analyses' },
        powerUsers: { $sum: { $cond: [{ $gte: ['$sessions', 10] }, 1, 0] } }
      }
    }
  ]);
};

// Static method to clean up old analytics data
analyticsSchema.statics.cleanup = function(days = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return this.deleteMany({ timestamp: { $lt: cutoffDate } });
};

module.exports = mongoose.model('Analytics', analyticsSchema);