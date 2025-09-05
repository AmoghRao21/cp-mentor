const fs = require('fs');

// Clean dist folder
if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true });
}
fs.mkdirSync('dist');

// Copy static files
fs.copyFileSync('public/manifest.json', 'dist/manifest.json');
fs.copyFileSync('public/popup.html', 'dist/popup.html');
fs.copyFileSync('src/popup/popup.js', 'dist/popup.js');

// Copy background script
fs.copyFileSync('src/background/index.js', 'dist/background.js');

// Read the Gemini service once
const geminiService = fs.readFileSync('src/utils/gemini.js', 'utf8');

// Build LeetCode content script
const leetcodeContent = fs.readFileSync('src/content/leetcode/index.js', 'utf8');
const leetcodeCombined = geminiService + '\n\n' + leetcodeContent;
fs.writeFileSync('dist/content-leetcode.js', leetcodeCombined);

// Build CodeForces content script  
const codeforcesContent = fs.readFileSync('src/content/codeforces/index.js', 'utf8');
const codeforcesCombined = geminiService + '\n\n' + codeforcesContent;
fs.writeFileSync('dist/content-codeforces.js', codeforcesCombined);

console.log('✅ Build complete with multi-platform support!');
console.log('📁 Content scripts created:');
console.log('  - content-leetcode.js');
console.log('  - content-codeforces.js');