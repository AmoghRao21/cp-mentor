// Popup script for CP Mentor
document.addEventListener('DOMContentLoaded', async () => {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    // Check backend service status via background script
    try {
        chrome.runtime.sendMessage({ type: 'HEALTH_CHECK', data: {} }, (response) => {
            if (chrome.runtime.lastError) {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Service temporarily offline';
            } else if (response.success) {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'Service online and ready!';
            } else {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Service temporarily offline';
            }
        });
    } catch (error) {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Service temporarily offline';
    }
});