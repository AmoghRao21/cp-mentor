// Vercel serverless entry point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// Import configuration and utilities
const config = require('../src/config/config');
const logger = require('../src/utils/logger');
const database = require('../src/config/database');

// Import middleware
const errorHandler = require('../src/middleware/errorHandler');
const authMiddleware = require('../src/middleware/auth');

// Import routes
const authRoutes = require('../src/routes/auth');
const aiRoutes = require('../src/routes/ai');
const userRoutes = require('../src/routes/user');
const analyticsRoutes = require('../src/routes/analytics');

const app = express();

// Connect to database (serverless)
let dbConnected = false;
async function connectDB() {
  if (!dbConnected) {
    await database.connect();
    dbConnected = true;
    logger.info('🚀 Serverless database connected');
  }
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration for extensions
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || 
        origin.startsWith('chrome-extension://') || 
        origin.startsWith('moz-extension://') ||
        config.cors.origin.some(allowed => origin.match(new RegExp(allowed)))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Extension-Version', 'X-Session-ID'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization
app.use(mongoSanitize());

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim(), { type: 'HTTP' })
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    error: 'AI request limit exceeded. Please wait before making more requests.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use('/api/ai', aiLimiter);

// Request context middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  req.requestId = require('crypto').randomUUID();
  req.clientInfo = {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    extensionVersion: req.get('X-Extension-Version'),
    sessionId: req.get('X-Session-ID'),
  };
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    const dbHealth = await database.healthCheck();
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: '1.0.0',
      database: dbHealth,
      serverless: true
    };

    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Service temporarily unavailable'
    });
  }
});

// Connect to DB before handling routes
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    logger.error('Database connection failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Database unavailable'
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', authMiddleware.optional, aiRoutes);
app.use('/api/users', authMiddleware.required, userRoutes);
app.use('/api/analytics', authMiddleware.admin, analyticsRoutes);

// Root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'CP Mentor API Server',
    version: '1.0.0',
    serverless: true,
    status: 'running'
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
  });
});

// Global error handler
app.use(errorHandler.errorHandler);

module.exports = app;