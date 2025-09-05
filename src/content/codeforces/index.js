// CodeForces Content Script
console.log('CP Mentor: CodeForces content script loaded!');

let hintsHistory = [];
let currentProblemData = null;

// Check if we're on a problem page
function isProblemPage() {
    return window.location.pathname.includes('/problem/') || 
           window.location.pathname.includes('/contest/');
}

// Get problem title
function getProblemTitle() {
    const titleElement = document.querySelector('.title') || 
                        document.querySelector('.problem-statement .header .title');
    return titleElement ? titleElement.textContent.trim() : 'CodeForces Problem';
}

// Get problem difficulty (CodeForces uses ratings)
function getProblemDifficulty() {
    const ratingElement = document.querySelector('.tag-box');
    if (ratingElement) {
        const rating = ratingElement.textContent.trim();
        if (rating.includes('*')) {
            return `Rating: ${rating}`;
        }
    }
    return 'Unknown Rating';
}

// Get problem statement
function getProblemStatement() {
    const problemDiv = document.querySelector('.problem-statement');
    return problemDiv ? problemDiv.innerText.substring(0, 1000) : 'Problem statement not found';
}

// Get user's code from CodeForces editor
function getUserCode() {
    console.log('🔍 Attempting to extract user code from CodeForces...');
    
    // CodeForces uses CodeMirror editor
    const codeMirror = document.querySelector('.CodeMirror');
    if (codeMirror && codeMirror.CodeMirror) {
        const code = codeMirror.CodeMirror.getValue();
        console.log('Code from CodeMirror:', code.length, 'characters');
        return code;
    }
    
    // Fallback: textarea
    const textareas = document.querySelectorAll('textarea');
    for (let textarea of textareas) {
        if (textarea.value && textarea.value.trim()) {
            console.log('Code from textarea:', textarea.value.length, 'characters');
            return textarea.value;
        }
    }
    
    console.log('❌ No code found in CodeForces editor');
    return '';
}

// Update hint display
function updateHintDisplay(hintText) {
    const hintElement = document.getElementById('current-hint');
    const hintCounter = document.getElementById('hint-counter');
    const nextButton = document.getElementById('next-hint-btn');
    
    if (hintElement) {
        hintElement.innerHTML = hintText.replace(/\n/g, '<br>');
        hintCounter.textContent = `Hint ${hintsHistory.length}`;
        
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
        } else {
            const fallbackHint = "Think about the problem constraints and what algorithm patterns might apply here.";
            hintsHistory.push(fallbackHint);
            updateHintDisplay(fallbackHint);
        }
    } catch (error) {
        console.error('Error getting next hint:', error);
        nextButton.disabled = false;
        nextButton.textContent = 'Next Hint →';
        updateHintDisplay('Sorry, I had trouble generating a hint. Please try again!');
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
        } else {
            updateHintDisplay('Code analysis service is not available right now.');
        }
    } catch (error) {
        console.error('Error analyzing code:', error);
        updateHintDisplay('Sorry, I had trouble analyzing your code. Please try again!');
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.textContent = '🔍 Analyze My Code';
    }
}

// Create mentor UI widget (similar to LeetCode but positioned differently for CodeForces)
function createMentorWidget() {
    const widget = document.createElement('div');
    widget.id = 'cp-mentor-widget';
    widget.style.cssText = `
        position: fixed;
        top: 80px;
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
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    widget.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; color: #60a5fa; font-size: 16px;">🤖 CP Mentor</h3>
            <button id="close-mentor" style="background: none; border: none; color: #999; cursor: pointer; font-size: 18px;">×</button>
        </div>
        <div style="margin-bottom: 12px; font-size: 12px;">
            <strong>Problem:</strong> ${currentProblemData.title}<br>
            <strong>Platform:</strong> <span style="color: #f59e0b;">CodeForces</span><br>
            <strong>Difficulty:</strong> <span style="color: #10b981;">${currentProblemData.difficulty}</span>
        </div>
        <div style="border-top: 1px solid #333; padding-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="color: #d1d5db; font-weight: bold;">💡 AI Mentoring</span>
                <span id="hint-counter" style="color: #9ca3af; font-size: 12px;">Ready</span>
            </div>
            <div style="background: #262626; padding: 12px; border-radius: 6px; margin-bottom: 12px; min-height: 60px; max-height: 120px; overflow-y: auto;">
                <p id="current-hint" style="margin: 0; color: #e5e7eb; font-style: italic; line-height: 1.4;">Ready to help with your CodeForces problem! Click "Next Hint" for guidance.</p>
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
    });
}

// Main function
function initialize() {
    if (isProblemPage()) {
        console.log('CP Mentor: Detected CodeForces problem page');
        
        setTimeout(() => {
            currentProblemData = {
                title: getProblemTitle(),
                difficulty: getProblemDifficulty(),
                statement: getProblemStatement()
            };
            
            console.log('CodeForces problem data:', currentProblemData);
            
            // Remove existing widget
            const existingWidget = document.getElementById('cp-mentor-widget');
            if (existingWidget) {
                existingWidget.remove();
            }
            
            hintsHistory = [];
            createMentorWidget();
        }, 3000);
    }
}

// Run when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}