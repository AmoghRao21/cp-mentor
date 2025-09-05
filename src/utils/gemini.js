// Backend API integration via background script
class GeminiService {
    constructor() {
        // No direct API calls - everything goes through background script
    }

    async generateNextHint(problemTitle, problemStatement, difficulty, previousHints = [], userCode = '') {
        try {
            const response = await this.sendMessageToBackground('GENERATE_HINT', {
                problemTitle,
                problemStatement,
                difficulty,
                previousHints,
                userCode,
                platform: 'leetcode'
            });
            
            if (response.success) {
                return response.data.hint;
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Hint generation error:', error);
            return "I'm having trouble generating hints right now. Please try again!";
        }
    }

    async analyzeCode(problemTitle, userCode, problemStatement) {
        try {
            const response = await this.sendMessageToBackground('ANALYZE_CODE', {
                problemTitle,
                userCode,
                problemStatement,
                platform: 'leetcode'
            });
            
            if (response.success) {
                return response.data.analysis;
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Code analysis error:', error);
            return "I'm having trouble analyzing your code right now. Please try again!";
        }
    }

    // Helper method to communicate with background script
    async sendMessageToBackground(type, data) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, data }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async checkBackendHealth() {
        try {
            const response = await this.sendMessageToBackground('HEALTH_CHECK', {});
            return response.success;
        } catch (error) {
            return false;
        }
    }
}

const geminiService = new GeminiService();