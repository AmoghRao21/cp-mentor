const mongoose = require('mongoose');
const config = require('./config');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Connection options for production
      const options = {
        ...config.mongodb.options,
        maxPoolSize: 10, // Maximum number of connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        family: 4, // Use IPv4, skip trying IPv6
      };

      // Connect to MongoDB
      this.connection = await mongoose.connect(config.mongodb.uri, options);
      this.isConnected = true;

      logger.info('✅ MongoDB connected successfully', {
        host: this.connection.connection.host,
        port: this.connection.connection.port,
        database: this.connection.connection.name
      });

      // Connection event handlers
      mongoose.connection.on('error', (error) => {
        logger.error('❌ MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('⚠️  MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('🔄 MongoDB reconnected');
        this.isConnected = true;
      });

      // Graceful shutdown handler
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

      return this.connection;

    } catch (error) {
      logger.error('❌ MongoDB connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.connection.close();
        this.isConnected = false;
        logger.info('🔌 MongoDB connection closed');
      }
    } catch (error) {
      logger.error('❌ Error closing MongoDB connection:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', message: 'Not connected to database' };
      }

      // Simple ping to check connection
      await mongoose.connection.db.admin().ping();
      
      const stats = await mongoose.connection.db.stats();
      
      return {
        status: 'connected',
        database: mongoose.connection.name,
        collections: stats.collections,
        dataSize: `${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`,
        indexSize: `${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`,
        uptime: process.uptime()
      };

    } catch (error) {
      logger.error('Database health check failed:', error);
      return { status: 'error', message: error.message };
    }
  }

  async setupIndexes() {
    try {
      logger.info('🔧 Setting up database indexes...');

      // Get all models
      const models = mongoose.models;
      
      for (const modelName in models) {
        const model = models[modelName];
        await model.createIndexes();
        logger.info(`✅ Indexes created for ${modelName}`);
      }

      logger.info('🎯 All database indexes created successfully');
    } catch (error) {
      logger.error('❌ Error creating indexes:', error);
      throw error;
    }
  }

  async seedData() {
    try {
      logger.info('🌱 Seeding initial data...');
      
      // Import models
      const User = require('../models/User');
      
      // Check if admin user exists
      const adminExists = await User.findOne({ role: 'admin' });
      
      if (!adminExists) {
        // Create default admin user
        const adminUser = new User({
          email: 'admin@cpmentor.dev',
          username: 'admin',
          password: 'admin123456', // This will be hashed automatically
          role: 'admin',
          isEmailVerified: true,
          profile: {
            firstName: 'CP',
            lastName: 'Mentor',
          },
          preferences: {
            hintStyle: 'advanced',
            platforms: ['leetcode', 'codeforces', 'codechef']
          }
        });
        
        await adminUser.save();
        logger.info('✅ Admin user created: admin@cpmentor.dev');
      }
      
      logger.info('🎯 Data seeding completed');
    } catch (error) {
      logger.error('❌ Error seeding data:', error);
      throw error;
    }
  }

  // Get connection statistics
  getStats() {
    if (!this.isConnected) {
      return { connected: false };
    }

    const connection = mongoose.connection;
    return {
      connected: true,
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      name: connection.name,
      collections: Object.keys(connection.collections).length,
    };
  }
}

// Export singleton instance
const database = new Database();

module.exports = database;