const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/config');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    this.isHealthy = false;
    this.lastHealthCheck = null;
    
    // Initialize service
    this.initialize();
  }

  async initialize() {
    try {
      await this.healthCheck();
      logger.info('🤖 AI Service initialized successfully');
    } catch (error) {
      logger.error('❌ AI Service initialization failed:', error);
    }
  }

  async healthCheck() {
    try {
      const startTime = Date.now();
      
      // Simple test prompt
      const result = await this.model.generateContent({
        contents: [{
          parts: [{ text: 'Reply with just "OK" if you can understand this.' }]
        }]
      });

      const response = await result.response;
      const responseTime = Date.now() - startTime;
      
      this.isHealthy = response.text().trim().includes('OK');
      this.lastHealthCheck = new Date();

      logger.info('AI Service health check:', {
        healthy: this.isHealthy,
        responseTime,
        provider: 'gemini-pro'
      });

      return {
        healthy: this.isHealthy,
        provider: 'gemini-pro',
        responseTime,
        lastCheck: this.lastHealthCheck
      };

    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();
      
      logger.error('AI Service health check failed:', error);
      
      return {
        healthy: false,
        error: error.message,
        lastCheck: this.lastHealthCheck
      };
    }
  }

  async generateHint(options) {
    const {
      problemTitle,
      problemStatement,
      platform,
      difficulty,
      previousHints = [],
      userCode = '',
      userLevel = 'intermediate'
    } = options;

    if (!this.isHealthy && this.lastHealthCheck && Date.now() - this.lastHealthCheck > 60000) {
      await this.healthCheck();
    }

    const startTime = Date.now();

    try {
      const prompt = this.buildHintPrompt({
        problemTitle,
        problemStatement,
        platform,
        difficulty,
        previousHints,
        userCode,
        userLevel
      });

      logger.info('Generating hint with Gemini:', {
        problemTitle,
        platform,
        difficulty,
        hintsGiven: previousHints.length,
        codePresent: userCode.length > 0,
        userLevel
      });

      const result = await this.model.generateContent({
        contents: [{
          parts: [{ text: prompt }]
        }]
      });

      const response = await result.response;
      const hint = response.text().trim();
      
      const responseTime = Date.now() - startTime;

      logger.info('Hint generated successfully:', {
        problemTitle,
        platform,
        responseTime,
        hintLength: hint.length
      });

      return hint;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Hint generation failed:', {
        error: error.message,
        problemTitle,
        platform,
        responseTime
      });

      // Return intelligent fallback based on context
      return this.getFallbackHint(previousHints.length, userCode.length > 0, platform, difficulty);
    }
  }

  async analyzeCode(options) {
    const {
      problemTitle,
      userCode,
      problemStatement,
      platform,
      userLevel = 'intermediate'
    } = options;

    if (!this.isHealthy && this.lastHealthCheck && Date.now() - this.lastHealthCheck > 60000) {
      await this.healthCheck();
    }

    const startTime = Date.now();

    try {
      const prompt = this.buildCodeAnalysisPrompt({
        problemTitle,
        userCode,
        problemStatement,
        platform,
        userLevel
      });

      logger.info('Analyzing code with Gemini:', {
        problemTitle,
        platform,
        codeLength: userCode.length,
        codeLanguage: this.detectLanguage(userCode),
        userLevel
      });

      const result = await this.model.generateContent({
        contents: [{
          parts: [{ text: prompt }]
        }]
      });

      const response = await result.response;
      const analysis = response.text().trim();
      
      const responseTime = Date.now() - startTime;

      logger.info('Code analysis completed:', {
        problemTitle,
        platform,
        responseTime,
        analysisLength: analysis.length
      });

      return analysis;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Code analysis failed:', {
        error: error.message,
        problemTitle,
        platform,
        codeLength: userCode.length,
        responseTime
      });

      // Return intelligent fallback analysis
      return this.getFallbackCodeAnalysis(userCode, platform);
    }
  }

  buildHintPrompt({ problemTitle, problemStatement, platform, difficulty, previousHints, userCode, userLevel }) {
    const levelInstructions = {
      beginner: "Use simple language and explain basic concepts. Focus on understanding the problem first.",
      intermediate: "Provide balanced hints that guide algorithmic thinking. Assume basic programming knowledge.",
      advanced: "Give concise, algorithmic hints. Focus on optimization and advanced patterns."
    };

    const platformContext = {
      leetcode: "This is a LeetCode problem. Focus on clean, optimal solutions and discuss time/space complexity.",
      codeforces: "This is a CodeForces problem. Consider contest constraints, time limits, and competitive programming patterns.",
      codechef: "This is a CodeChef problem. Focus on problem-solving approach and mathematical insights."
    };

    let prompt = `You are an expert competitive programming mentor. Your goal is to guide students to discover solutions through progressive hints, NOT to give away the answer.

**Context:**
- Problem: ${problemTitle}
- Platform: ${platform.toUpperCase()}
- Difficulty: ${difficulty}
- User Level: ${userLevel}
- Previous Hints Given: ${previousHints.length}

${problemStatement ? `**Problem Statement:** ${problemStatement.substring(0, 800)}...` : ''}

${platformContext[platform] || ''}

**Previous Hints:**
${previousHints.length > 0 ? previousHints.map((hint, i) => `${i + 1}. ${hint}`).join('\n') : 'None - this is the first hint.'}

${userCode ? `**Current Code Attempt:**
\`\`\`
${userCode.substring(0, 1500)}
\`\`\`

The user has written code! Analyze their approach and guide them toward improvements.` : '**No Code Yet:** Help them think about the approach before coding.'}

**Instructions:**
${levelInstructions[userLevel]}

**Rules:**
- Build upon previous hints without repeating them
- ${userCode ? 'Give feedback on their code approach and suggest improvements' : 'Focus on problem understanding and algorithmic approach'}
- NEVER provide working code solutions
- Ask thought-provoking questions when helpful
- Be encouraging and educational
- Keep response to 2-3 sentences maximum
- ${platform === 'codeforces' ? 'Consider time/memory constraints typical in competitive programming' : ''}

Generate the next helpful hint:`;

    return prompt;
  }

  buildCodeAnalysisPrompt({ problemTitle, userCode, problemStatement, platform, userLevel }) {
    const language = this.detectLanguage(userCode);
    
    let prompt = `You are an expert code reviewer specializing in competitive programming. Analyze this code attempt and provide constructive feedback.

**Context:**
- Problem: ${problemTitle}
- Platform: ${platform.toUpperCase()}
- Language: ${language}
- User Level: ${userLevel}

${problemStatement ? `**Problem Statement:** ${problemStatement.substring(0, 800)}...` : ''}

**Code to Analyze:**
\`\`\`${language}
${userCode}
\`\`\`

**Analysis Guidelines:**
- Focus on logical correctness and algorithm efficiency
- Identify potential bugs or edge case issues
- Suggest optimizations without giving complete solutions
- Explain time/space complexity concerns
- Be encouraging while being thorough
- ${platform === 'codeforces' ? 'Consider contest time/memory limits' : 'Focus on clean, maintainable code'}

**Format your response as:**
1. **What's Working Well:** Positive feedback
2. **Potential Issues:** Logic problems, bugs, edge cases
3. **Optimization Ideas:** Performance improvements (without spoilers)
4. **Next Steps:** What to focus on next

Keep each section concise but helpful. Total response should be 4-6 sentences.`;

    return prompt;
  }

  detectLanguage(code) {
    if (code.includes('def ') || code.includes('import ') || code.includes('print(')) return 'python';
    if (code.includes('function') || code.includes('const ') || code.includes('let ')) return 'javascript';
    if (code.includes('#include') || code.includes('int main') || code.includes('cout')) return 'cpp';
    if (code.includes('public class') || code.includes('System.out')) return 'java';
    if (code.includes('package main') || code.includes('func ')) return 'go';
    if (code.includes('use ') || code.includes('fn ')) return 'rust';
    return 'unknown';
  }

  getFallbackHint(hintNumber, hasCode, platform, difficulty) {
    const fallbackHints = [
      "Start by understanding what the problem is asking. What are the inputs and expected outputs?",
      "Think about the constraints. What do they tell you about the expected time complexity?",
      "Consider what data structures would be most helpful for efficient lookups or storage.",
      "Break the problem into smaller steps. What would your algorithm do in each step?",
      "Think about edge cases. What happens with minimum or maximum input values?",
      hasCode ? "Review your current approach step by step. Are you handling all the requirements?" : "Time to start coding! Implement your approach and test with the examples.",
    ];

    const index = Math.min(hintNumber, fallbackHints.length - 1);
    return fallbackHints[index];
  }

  getFallbackCodeAnalysis(userCode, platform) {
    const language = this.detectLanguage(userCode);
    
    let analysis = `**Code Analysis (${language.toUpperCase()}):**\n\n`;
    
    // Basic analysis based on patterns
    if (userCode.includes('for') && userCode.includes('for')) {
      analysis += "**Potential Issue:** I see nested loops which might lead to O(n²) time complexity. Consider if there's a more efficient approach.\n\n";
    }
    
    if (userCode.includes('return []') || userCode.includes('return 0') || userCode.includes('return None')) {
      analysis += "**Implementation Status:** You have placeholder return values. Make sure to implement the complete logic.\n\n";
    }
    
    if (userCode.includes('dict') || userCode.includes('{}') || userCode.includes('map') || userCode.includes('unordered_map')) {
      analysis += "**Good Choice:** Using hash maps/dictionaries for efficient lookups is often the right approach!\n\n";
    }
    
    analysis += `**Next Steps:** Test your code with the provided examples and consider edge cases. ${platform === 'codeforces' ? 'Remember to check time limits!' : 'Focus on correctness first, then optimization.'}`;
    
    return analysis;
  }

  // Batch processing for multiple requests (useful for analytics)
  async generateMultipleHints(requests) {
    const results = [];
    
    for (const request of requests) {
      try {
        const hint = await this.generateHint(request);
        results.push({ success: true, hint, request: request.problemTitle });
      } catch (error) {
        results.push({ success: false, error: error.message, request: request.problemTitle });
      }
      
      // Small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  // Get service statistics
  getStats() {
    return {
      healthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      provider: 'gemini-1.5-flash',
      features: ['hint_generation', 'code_analysis'],
      supportedLanguages: ['python', 'javascript', 'cpp', 'java', 'go', 'rust']
    };
  }
}

// Export singleton instance
const aiService = new AIService();

module.exports = aiService;