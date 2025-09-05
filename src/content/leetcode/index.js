// Backend API integration for CP Mentor
const BACKEND_API_URL = 'http://localhost:3000/api'; // Change to your production URL

class GeminiService {
    constructor() {
        this.backendUrl = BACKEND_API_URL;
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


// LeetCode Content Script
console.log('CP Mentor: LeetCode content script loaded!');

let hintsHistory = [];
let currentProblemData = null;

// Check if we're on a problem page
function isProblemPage() {
    return window.location.pathname.includes('/problems/');
}

// Get problem title
function getProblemTitle() {
    const element = document.querySelector('.text-title-large');
    return element ? element.textContent.trim() : 'Problem title not found';
}

// Get problem difficulty  
function getProblemDifficulty() {
    const diffElement = document.querySelector('[class*="text-difficulty"]');
    return diffElement ? diffElement.textContent.trim() : 'Unknown';
}

// Get problem statement text
function getProblemStatement() {
    const contentSelectors = [
        '[data-track-load="description_content"]',
        '.elfjS',
        '[data-cy="question-content"]',
        '.question-content'
    ];
    
    for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
            return element.innerText.trim().substring(0, 1000); // Limit length
        }
    }
    return 'Problem statement not found';
}

// Get user's current code from the editor
function getUserCode() {
    console.log('🔍 Attempting to extract user code...');
    
    // Method 1: Monaco Editor API
    if (window.monaco && window.monaco.editor) {
        try {
            const models = window.monaco.editor.getModels();
            console.log('Monaco models found:', models.length);
            if (models && models.length > 0) {
                const code = models[0].getValue();
                console.log('Code from Monaco API:', code.length, 'characters');
                if (code.trim()) return code;
            }
        } catch (e) {
            console.log('Monaco API error:', e);
        }
    }
    
    // Method 2: Direct textarea approach
    const textareas = document.querySelectorAll('textarea');
    console.log('Found textareas:', textareas.length);
    for (let textarea of textareas) {
        if (textarea.value && textarea.value.trim()) {
            console.log('Code from textarea:', textarea.value.length, 'characters');
            return textarea.value;
        }
    }
    
    // Method 3: Monaco editor content from DOM
    const editorLines = document.querySelectorAll('.view-line');
    if (editorLines.length > 0) {
        console.log('Found editor lines:', editorLines.length);
        let code = Array.from(editorLines)
            .map(line => line.textContent || '')
            .join('\n');
        console.log('Code from view-lines:', code.length, 'characters');
        if (code.trim()) return code;
    }
    
    console.log('❌ No code found with any method');
    return '';
}

// Show toast notification to user
function showToast(message, type = 'info') {
    const existingToast = document.getElementById('cp-mentor-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.id = 'cp-mentor-toast';
    toast.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 100000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 300px;
        opacity: 0;
        transform: translateX(20px);
        transition: all 0.3s ease;
    `;
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Update hint display
function updateHintDisplay(hintText) {
    const hintElement = document.getElementById('current-hint');
    const hintCounter = document.getElementById('hint-counter');
    const nextButton = document.getElementById('next-hint-btn');
    
    if (hintElement) {
        hintElement.innerHTML = hintText.replace(/\n/g, '<br>');
        hintCounter.textContent = `Hint ${hintsHistory.length}`;
        
        // Re-enable button for next hint
        nextButton.disabled = false;
        nextButton.textContent = 'Next Hint →';
        nextButton.style.opacity = '1';
    }
}

// Get next hint from AI
async function getNextHint() {
    const nextButton = document.getElementById('next-hint-btn');
    nextButton.disabled = true;
    nextButton.textContent = 'Thinking...';
    
    try {
        const userCode = getUserCode();
        console.log('User code length:', userCode.length);
        
        if (typeof geminiService !== 'undefined') {
            const hint = await geminiService.generateNextHint(
                currentProblemData.title,
                currentProblemData.statement,
                currentProblemData.difficulty,
                hintsHistory,
                userCode
            );
            
            hintsHistory.push(hint);
            updateHintDisplay(hint);
            
            // Show success feedback
            if (hintsHistory.length === 1) {
                showToast('Great! Here\'s your first hint 🎯', 'success');
            }
        } else {
            throw new Error('AI service not available');
        }
    } catch (error) {
        console.error('Error getting next hint:', error);
        showToast('Having trouble generating hints right now. Please try again! 🤔', 'error');
        updateHintDisplay('Sorry, I had trouble generating a hint. The AI service might be temporarily unavailable.');
    } finally {
        nextButton.disabled = false;
        nextButton.textContent = 'Next Hint →';
    }
}

// Analyze user's code
async function analyzeCode() {
    const userCode = getUserCode().trim();
    
    if (!userCode) {
        updateHintDisplay('Please write some code first, then I can help analyze it! 😊');
        return;
    }
    
    const analyzeButton = document.getElementById('analyze-code-btn');
    analyzeButton.disabled = true;
    analyzeButton.textContent = 'Analyzing...';
    
    try {
        if (typeof geminiService !== 'undefined') {
            const analysis = await geminiService.analyzeCode(
                currentProblemData.title,
                userCode,
                currentProblemData.statement
            );
            
            updateHintDisplay(`📝 <strong>Code Analysis:</strong><br><br>${analysis}`);
            showToast('Code analysis complete! 🔍', 'success');
        } else {
            updateHintDisplay('Code analysis service is not available right now. Try the hints instead!');
        }
    } catch (error) {
        console.error('Error analyzing code:', error);
        showToast('Having trouble analyzing code right now. Please try again! 🤔', 'error');
        updateHintDisplay('Sorry, I had trouble analyzing your code. Please try again!');
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.textContent = '🔍 Analyze My Code';
    }
}

// Create mentor UI widget
function createMentorWidget() {
    const widget = document.createElement('div');
    widget.id = 'cp-mentor-widget';
    widget.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 340px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 16px;
        color: white;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-height: 90vh;
        overflow-y: auto;
    `;
    
    widget.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; color: #60a5fa; font-size: 16px;">🤖 CP Mentor</h3>
            <button id="close-mentor" style="background: none; border: none; color: #999; cursor: pointer; font-size: 18px;">×</button>
        </div>
        <div style="margin-bottom: 12px; font-size: 12px;">
            <strong>Problem:</strong> ${currentProblemData.title}<br>
            <strong>Difficulty:</strong> <span style="color: #10b981;">${currentProblemData.difficulty}</span>
        </div>
        <div style="border-top: 1px solid #333; padding-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="color: #d1d5db; font-weight: bold;">💡 AI Mentoring</span>
                <span id="hint-counter" style="color: #9ca3af; font-size: 12px;">Ready</span>
            </div>
            <div style="background: #262626; padding: 12px; border-radius: 6px; margin-bottom: 12px; min-height: 60px; max-height: 120px; overflow-y: auto;">
                <p id="current-hint" style="margin: 0; color: #e5e7eb; font-style: italic; line-height: 1.4;">Click "Next Hint" to get personalized guidance, or write some code and click "Analyze My Code" for feedback!</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <button id="next-hint-btn" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                ">Next Hint →</button>
                <button id="analyze-code-btn" style="
                    background: #059669;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                ">🔍 Analyze My Code</button>
                <button id="reset-hints-btn" style="
                    background: #374151;
                    color: #d1d5db;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                ">Reset Session</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(widget);
    
    // Add event listeners
    document.getElementById('close-mentor').addEventListener('click', () => {
        widget.remove();
    });
    
    document.getElementById('next-hint-btn').addEventListener('click', getNextHint);
    document.getElementById('analyze-code-btn').addEventListener('click', analyzeCode);
    
    document.getElementById('reset-hints-btn').addEventListener('click', () => {
        hintsHistory = [];
        document.getElementById('current-hint').innerHTML = 'Session reset! Click "Next Hint" for fresh guidance.';
        document.getElementById('hint-counter').textContent = 'Ready';
        showToast('Session reset! Ready for fresh guidance 🔄', 'info');
    });
}

// Main function
function initialize() {
    if (isProblemPage()) {
        console.log('CP Mentor: Detected LeetCode problem page');
        
        setTimeout(() => {
            // Store current problem data
            currentProblemData = {
                title: getProblemTitle(),
                difficulty: getProblemDifficulty(),
                statement: getProblemStatement()
            };
            
            console.log('Problem data:', currentProblemData);
            
            // Remove existing widget if any
            const existingWidget = document.getElementById('cp-mentor-widget');
            if (existingWidget) {
                existingWidget.remove();
            }
            
            // Reset for new problem
            hintsHistory = [];
            
            createMentorWidget();
        }, 3000); // Increased wait time for editor to load
    }
}

// Run when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}