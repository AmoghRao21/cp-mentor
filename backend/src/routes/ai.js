const express = require('express');
const { body, validationResult } = require('express-validator');

const { AppError, catchAsync } = require('../middleware/errorHandler');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const User = require('../models/User');
const Session = require('../models/Session');
const Analytics = require('../models/Analytics');

// Import AI service (we'll create this next)
const AIService = require('../services/aiService');

const router = express.Router();

// Apply extension auth to all AI routes
router.use(authMiddleware.extensionAuth);

// Validation rules
const generateHintValidation = [
  body('problemTitle').notEmpty().withMessage('Problem title is required'),
  body('problemStatement').optional().isLength({ max: 10000 }).withMessage('Problem statement too long'),
  body('platform').isIn(['leetcode', 'codeforces', 'codechef']).withMessage('Invalid platform'),
  body('difficulty').optional().isString(),
  body('previousHints').optional().isArray().withMessage('Previous hints must be an array'),
  body('userCode').optional().isString().isLength({ max: 50000 }).withMessage('Code too long')
];

const analyzeCodeValidation = [
  body('problemTitle').notEmpty().withMessage('Problem title is required'),
  body('userCode').notEmpty().withMessage('Code is required'),
  body('platform').isIn(['leetcode', 'codeforces', 'codechef']).withMessage('Invalid platform'),
  body('problemStatement').optional().isString()
];

// Helper function to validate request
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400));
  }
  next();
};

// Helper function to find or create session
const findOrCreateSession = async (req, problemData) => {
  const sessionId = req.extensionInfo.sessionId;
  
  if (sessionId) {
    // Try to find existing session
    let session = await Session.findOne({ sessionId, isActive: true });
    
    if (session) {
      return session;
    }
  }
  
  // Create new session
  const newSessionId = sessionId || require('crypto').randomUUID();
  
  const session = await Session.create({
    userId: req.user?._id,
    sessionId: newSessionId,
    problem: problemData,
    metadata: {
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      extensionVersion: req.extensionInfo.version,
    }
  });

  // Record analytics
  await Analytics.recordEvent('session_started', {
    platform: problemData.platform,
    problemTitle: problemData.title,
    problemDifficulty: problemData.difficulty,
    extensionVersion: req.extensionInfo.version,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  }, req.user?._id, session._id);

  return session;
};

// @route   POST /api/ai/generate-hint
// @desc    Generate next hint for problem
// @access  Public (with extension auth)
router.post('/generate-hint', generateHintValidation, validateRequest, catchAsync(async (req, res, next) => {
  const startTime = Date.now();
  const {
    problemTitle,
    problemStatement = '',
    platform,
    difficulty = 'Unknown',
    previousHints = [],
    userCode = ''
  } = req.body;

  logger.logAIRequest('generate_hint', {
    problemTitle,
    platform,
    codeLength: userCode.length,
    hintsCount: previousHints.length
  });

  try {
    // Find or create session
    const session = await findOrCreateSession(req, {
      title: problemTitle,
      platform,
      difficulty,
      statement: problemStatement.substring(0, 1000), // Truncate for storage
      url: req.get('Referer')
    });

    // Generate hint using AI service
    const hint = await AIService.generateHint({
      problemTitle,
      problemStatement,
      platform,
      difficulty,
      previousHints,
      userCode,
      userLevel: req.user?.preferences?.hintStyle || 'intermediate'
    });

    const responseTime = Date.now() - startTime;

    // Add hint to session
    await session.addHint({
      content: hint,
      userCode: userCode.length > 0 ? userCode.substring(0, 1000) : '', // Truncate for storage
      codeLength: userCode.length,
      responseTime
    });

    // Update user stats if logged in
    if (req.user) {
      await req.user.updateStats('hint');
    }

    // Record analytics
    await Analytics.recordEvent('hint_requested', {
      platform,
      problemTitle,
      problemDifficulty: difficulty,
      hintNumber: previousHints.length + 1,
      codeLength: userCode.length,
      responseTime,
      aiProvider: 'gemini',
      extensionVersion: req.extensionInfo.version,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    }, req.user?._id, session._id);

    logger.info('Hint generated successfully:', {
      problemTitle,
      platform,
      hintNumber: previousHints.length + 1,
      responseTime,
      userId: req.user?._id
    });

    res.status(200).json({
      status: 'success',
      data: {
        hint,
        hintNumber: previousHints.length + 1,
        sessionId: session.sessionId,
        responseTime
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // Record error analytics
    await Analytics.recordEvent('error_occurred', {
      operation: 'generate_hint',
      errorMessage: error.message,
      platform,
      problemTitle,
      responseTime,
      extensionVersion: req.extensionInfo.version,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    }, req.user?._id);

    logger.error('Hint generation failed:', {
      error: error.message,
      problemTitle,
      platform,
      userId: req.user?._id
    });

    next(error);
  }
}));

// @route   POST /api/ai/analyze-code  
// @desc    Analyze user's code
// @access  Public (with extension auth)
router.post('/analyze-code', analyzeCodeValidation, validateRequest, catchAsync(async (req, res, next) => {
  const startTime = Date.now();
  const {
    problemTitle,
    userCode,
    platform,
    problemStatement = ''
  } = req.body;

  logger.logAIRequest('analyze_code', {
    problemTitle,
    platform,
    codeLength: userCode.length
  });

  try {
    // Find or create session
    const session = await findOrCreateSession(req, {
      title: problemTitle,
      platform,
      statement: problemStatement.substring(0, 1000),
      url: req.get('Referer')
    });

    // Analyze code using AI service
    const analysis = await AIService.analyzeCode({
      problemTitle,
      userCode,
      problemStatement,
      platform,
      userLevel: req.user?.preferences?.hintStyle || 'intermediate'
    });

    const responseTime = Date.now() - startTime;

    // Add analysis to session
    await session.addCodeAnalysis({
      code: userCode.substring(0, 5000), // Truncate for storage
      analysis,
      codeLanguage: detectCodeLanguage(userCode),
      issues: analysis.issues || [],
      suggestions: analysis.suggestions || []
    });

    // Update user stats if logged in
    if (req.user) {
      await req.user.updateStats('analyze');
    }

    // Record analytics
    await Analytics.recordEvent('code_analyzed', {
      platform,
      problemTitle,
      codeLength: userCode.length,
      codeLanguage: detectCodeLanguage(userCode),
      responseTime,
      aiProvider: 'gemini',
      extensionVersion: req.extensionInfo.version,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    }, req.user?._id, session._id);

    logger.info('Code analysis completed:', {
      problemTitle,
      platform,
      codeLength: userCode.length,
      responseTime,
      userId: req.user?._id
    });

    res.status(200).json({
      status: 'success',
      data: {
        analysis,
        sessionId: session.sessionId,
        responseTime,
        codeLanguage: detectCodeLanguage(userCode)
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // Record error analytics
    await Analytics.recordEvent('error_occurred', {
      operation: 'analyze_code',
      errorMessage: error.message,
      platform,
      problemTitle,
      codeLength: userCode.length,
      responseTime,
      extensionVersion: req.extensionInfo.version,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    }, req.user?._id);

    logger.error('Code analysis failed:', {
      error: error.message,
      problemTitle,
      platform,
      codeLength: userCode.length,
      userId: req.user?._id
    });

    next(error);
  }
}));

// @route   GET /api/ai/health
// @desc    Check AI service health
// @access  Public
router.get('/health', catchAsync(async (req, res) => {
  const aiHealth = await AIService.healthCheck();
  
  res.status(200).json({
    status: 'success',
    data: {
      aiService: aiHealth,
      supportedPlatforms: ['leetcode', 'codeforces', 'codechef'],
      features: ['hint_generation', 'code_analysis'],
      version: require('../../package.json').version
    }
  });
}));

// Utility function to detect programming language
function detectCodeLanguage(code) {
  // Simple language detection based on syntax
  if (code.includes('def ') || code.includes('import ') || code.includes('print(')) return 'python';
  if (code.includes('function') || code.includes('const ') || code.includes('let ')) return 'javascript';
  if (code.includes('#include') || code.includes('int main')) return 'cpp';
  if (code.includes('public class') || code.includes('System.out')) return 'java';
  if (code.includes('package main') || code.includes('func ')) return 'go';
  if (code.includes('use ') || code.includes('fn ')) return 'rust';
  
  return 'unknown';
}

module.exports = router;