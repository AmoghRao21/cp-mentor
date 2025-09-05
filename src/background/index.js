// Background script for CP Mentor
console.log('CP Mentor: Background script loaded');

const BACKEND_URL = 'http://localhost:3000/api'; // Change to your production URL

// Handle API requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.type);
    
    if (request.type === 'GENERATE_HINT') {
        generateHint(request.data)
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => {
                console.error('Generate hint error:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }
    
    if (request.type === 'ANALYZE_CODE') {
        analyzeCode(request.data)
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => {
                console.error('Analyze code error:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
    
    if (request.type === 'HEALTH_CHECK') {
        healthCheck()
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => {
                console.error('Health check error:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

async function generateHint(data) {
    console.log('Making request to generate hint:', data.problemTitle);
    
    try {
        const response = await fetch(`${BACKEND_URL}/ai/generate-hint`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Extension-Version': '1.0.0',
                'X-Session-ID': generateSessionId()
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Hint generated successfully');
        return result.data;
        
    } catch (error) {
        console.error('Generate hint fetch error:', error);
        
        // Return fallback hint based on error type
        if (error.message.includes('fetch')) {
            return {
                hint: "I'm having trouble connecting to the mentoring service. Please check your internet connection and try again!"
            };
        } else {
            return {
                hint: "Having trouble generating a hint right now. Try breaking down the problem into smaller steps - what are the inputs and expected outputs?"
            };
        }
    }
}

async function analyzeCode(data) {
    console.log('Making request to analyze code for:', data.problemTitle);
    
    try {
        const response = await fetch(`${BACKEND_URL}/ai/analyze-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Extension-Version': '1.0.0',
                'X-Session-ID': generateSessionId()
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Code analysis completed successfully');
        return result.data;
        
    } catch (error) {
        console.error('Analyze code fetch error:', error);
        
        // Return fallback analysis
        if (error.message.includes('fetch')) {
            return {
                analysis: "I'm having trouble connecting to the code analysis service. Please check your internet connection and try again!"
            };
        } else {
            // Simple fallback analysis based on common patterns
            const codeLength = data.userCode ? data.userCode.length : 0;
            let analysis = "**Quick Code Review:**\n\n";
            
            if (codeLength < 50) {
                analysis += "Your code is quite short - make sure you're implementing the complete solution.\n\n";
            }
            
            if (data.userCode && data.userCode.includes('for') && data.userCode.includes('for')) {
                analysis += "I notice nested loops - consider if there's a more efficient approach with better time complexity.\n\n";
            }
            
            if (data.userCode && (data.userCode.includes('dict') || data.userCode.includes('map'))) {
                analysis += "Good use of hash maps for efficient lookups!\n\n";
            }
            
            analysis += "**Next Steps:** Test your code with the provided examples and consider edge cases.";
            
            return { analysis };
        }
    }
}

async function healthCheck() {
    console.log('Performing health check...');
    
    try {
        const response = await fetch(`${BACKEND_URL}/ai/health`, {
            method: 'GET',
            headers: {
                'X-Extension-Version': '1.0.0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Health check successful:', result);
        return result.data || { status: 'ok', message: 'Service is running' };
        
    } catch (error) {
        console.error('Health check failed:', error);
        return { 
            status: 'error', 
            message: 'Service temporarily unavailable',
            error: error.message 
        };
    }
}

// Generate a unique session ID for analytics
function generateSessionId() {
    return 'cp-mentor-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Extension installation handler
chrome.runtime.onInstalled.addListener((details) => {
    console.log('CP Mentor extension installed/updated:', details.reason);
    
    if (details.reason === 'install') {
        console.log('First installation - welcome message could be shown');
        // You could open a welcome page here
    } else if (details.reason === 'update') {
        console.log('Extension updated to version:', chrome.runtime.getManifest().version);
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('CP Mentor extension started');
});

// Keep service worker alive with periodic heartbeat
let heartbeatInterval;

async function startHeartbeat() {
    heartbeatInterval = setInterval(() => {
        console.log('CP Mentor heartbeat - service worker alive');
    }, 30000); // Every 30 seconds
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
}

// Start heartbeat when script loads
startHeartbeat();

// Clean up on suspension
chrome.runtime.onSuspend.addListener(() => {
    console.log('CP Mentor service worker suspending');
    stopHeartbeat();
});

// Error handling
self.addEventListener('error', (error) => {
    console.error('CP Mentor background script error:', error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('CP Mentor background script unhandled rejection:', event.reason);
});