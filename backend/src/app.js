const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// Import configuration and utilities
const config = require('./config/config');
const logger = require('./utils/logger');
const database = require('./config/database');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const userRoutes = require('./routes/user');
const analyticsRoutes = require('./routes/analytics');

class Application {
  constructor() {
    this.app = express();
    this.server = null;
  }

  async initialize() {
    try {
      // Connect to database
      await database.connect();
      
      // Setup database indexes (skip in development to avoid conflicts)
      if (config.nodeEnv === 'production') {
        await database.setupIndexes();
      } else {
        logger.info('⏭️  Skipping index setup in development mode');
      }
      
      // Seed initial data in development
      if (config.nodeEnv === 'development') {
        await database.seedData();
      }
      
      // Configure Express app
      this.configureMiddleware();
      this.configureRoutes();
      this.configureErrorHandling();
      
      logger.info('🚀 Application initialized successfully');
      
    } catch (error) {
      logger.error('❌ Application initialization failed:', error);
      process.exit(1);
    }
  }

  configureMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for API
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow Chrome extension origins
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

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Data sanitization
    this.app.use(mongoSanitize());

    // Compression middleware
    this.app.use(compression());

    // Request logging
    const morganFormat = config.nodeEnv === 'production' 
      ? 'combined' 
      : 'dev';
    
    this.app.use(morgan(morganFormat, {
      stream: {
        write: (message) => logger.info(message.trim(), { type: 'HTTP' })
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimiting.windowMs,
      max: config.rateLimiting.maxRequests,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.rateLimiting.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // AI-specific rate limiting (more strict)
    const aiLimiter = rateLimit({
      windowMs: config.rateLimiting.aiWindowMs,
      max: config.rateLimiting.aiMaxRequests,
      message: {
        error: 'AI request limit exceeded. Please wait before making more requests.',
        retryAfter: Math.ceil(config.rateLimiting.aiWindowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use(limiter);
    this.app.use('/api/ai', aiLimiter);

    // Request context middleware
    this.app.use((req, res, next) => {
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

    logger.info('⚙️  Middleware configured successfully');
  }

  configureRoutes() {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const dbHealth = await database.healthCheck();
        const health = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: config.nodeEnv,
          version: require('../package.json').version,
          database: dbHealth,
          memory: {
            used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
            total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`
          }
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

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/ai', authMiddleware.optional, aiRoutes);
    this.app.use('/api/users', authMiddleware.required, userRoutes);
    this.app.use('/api/analytics', authMiddleware.admin, analyticsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'CP Mentor API Server',
        version: require('../package.json').version,
        documentation: 'https://docs.cpmentor.dev',
        status: 'running'
      });
    });

    // 404 handler for undefined routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
        availableRoutes: [
          'GET /health',
          'GET /',
          'POST /api/auth/register',
          'POST /api/auth/login',
          'POST /api/ai/generate-hint',
          'POST /api/ai/analyze-code'
        ]
      });
    });

    logger.info('🛣️  Routes configured successfully');
  }

  configureErrorHandling() {
    // Global error handler
    this.app.use(errorHandler);

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at Promise:', { promise, reason });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    logger.info('🛡️  Error handling configured successfully');
  }

  async start() {
    try {
      const port = config.port;
      
      this.server = this.app.listen(port, () => {
        logger.info(`🎯 CP Mentor Backend Server running on port ${port}`, {
          environment: config.nodeEnv,
          port: port,
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
        });

        // Log available endpoints in development
        if (config.nodeEnv === 'development') {
          logger.info('📡 Available endpoints:');
          logger.info(`   Health: http://localhost:${port}/health`);
          logger.info(`   API: http://localhost:${port}/api`);
          logger.info(`   Docs: https://docs.cpmentor.dev`);
        }
      });

      // Graceful shutdown handling
      const shutdown = async (signal) => {
        logger.info(`🛑 ${signal} received, shutting down gracefully...`);
        
        this.server.close(async () => {
          logger.info('📡 HTTP server closed');
          
          try {
            await database.disconnect();
            logger.info('🔌 Database connection closed');
            
            logger.info('✅ Graceful shutdown completed');
            process.exit(0);
          } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
          }
        });

        // Force close server after 10 seconds
        setTimeout(() => {
          logger.error('⚠️  Could not close connections in time, forcefully shutting down');
          process.exit(1);
        }, 10000);
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

// Initialize and start the application
const app = new Application();

async function bootstrap() {
  try {
    await app.initialize();
    await app.start();
  } catch (error) {
    logger.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  bootstrap();
}

module.exports = { Application, app };