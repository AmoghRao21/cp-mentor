const winston = require('winston');
const path = require('path');
const config = require('../config/config');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'cp-mentor-backend' },
  transports: [
    // Write all logs with level 'error' and below to 'error.log'
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to 'combined.log'
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// Add console logging in development
if (config.nodeEnv === 'development') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Helper methods for structured logging
logger.logRequest = (req, res, responseTime) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userId: req.user?.id,
  });
};

logger.logAIRequest = (operation, data) => {
  logger.info('AI Request', {
    operation,
    provider: config.ai.provider,
    problemTitle: data.problemTitle,
    platform: data.platform,
    codeLength: data.userCode?.length || 0,
    hintsCount: data.previousHints?.length || 0,
  });
};

logger.logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
};

logger.logSecurity = (event, data) => {
  logger.warn('Security Event', {
    event,
    ...data
  });
};

module.exports = logger;