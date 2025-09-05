const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const config = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database Configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cp-mentor',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  
  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'cp-mentor-super-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  // AI Configuration
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    provider: process.env.AI_PROVIDER || 'gemini', // 'gemini' or 'openai'
  },
  
  // Rate Limiting
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: process.env.RATE_LIMIT_MAX || 100,
    aiWindowMs: 60 * 1000, // 1 minute for AI requests
    aiMaxRequests: process.env.AI_RATE_LIMIT_MAX || 10,
  },
  
  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN ? 
      process.env.CORS_ORIGIN.split(',') : 
      ['chrome-extension://*', 'http://localhost:*'],
    credentials: true,
  },
  
  // Analytics
  analytics: {
    enabled: process.env.ANALYTICS_ENABLED === 'true',
    trackingId: process.env.GOOGLE_ANALYTICS_ID,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  
  // Security
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutTime: parseInt(process.env.LOCKOUT_TIME) || 30 * 60 * 1000, // 30 minutes
  },
};

// Validation
const requiredEnvVars = [
  'GEMINI_API_KEY',
  'MONGODB_URI',
  'JWT_SECRET'
];

if (config.nodeEnv === 'production') {
  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  });
}

module.exports = config;