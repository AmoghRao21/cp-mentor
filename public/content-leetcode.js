// LeetCode Content Script
console.log('CP Mentor: LeetCode content script loaded!');

// Check if we're on a problem page
function isProblemPage() {
    return window.location.pathname.includes('/problems/');
}

// Get problem title
function getProblemTitle() {
    const titleElement = document.querySelector('[data-cy="question-title"]');
    return titleElement ? titleElement.textContent.trim() : 'Unknown Problem';
}

// Main function
function initialize() {
    if (isProblemPage()) {
        console.log('CP Mentor: Detected LeetCode problem page');
        console.log('Problem:', getProblemTitle());
    }
}

// Run when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}