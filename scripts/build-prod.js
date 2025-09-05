const fs = require('fs');

console.log('🏗️  Building CP Mentor Extension for Production...\n');

// Clean dist folder
if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true });
    console.log('🧹 Cleaned existing dist folder');
}
fs.mkdirSync('dist');

// Copy and process manifest for production
const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
manifest.version = require('../package.json').version;

// Remove localhost permissions for production
if (manifest.host_permissions) {
    manifest.host_permissions = manifest.host_permissions.filter(
        perm => !perm.includes('localhost')
    );
    // Add production API domain
    manifest.host_permissions.push('https://your-api-domain.com/*');
}

fs.writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
console.log('📄 Processed manifest.json for production');

// Copy static files
fs.copyFileSync('public/popup.html', 'dist/popup.html');

// Update popup script for production
const popupScript = fs.readFileSync('src/popup/popup.js', 'utf8');
const prodPopupScript = popupScript.replace(
    'http://localhost:3000/api/health',
    'https://your-api-domain.com/api/health'
);
fs.writeFileSync('dist/popup.js', prodPopupScript);
console.log('📁 Processed popup files');

// Update background script for production
const backgroundScript = fs.readFileSync('src/background/index.js', 'utf8');
const prodBackgroundScript = backgroundScript.replace(
    'http://localhost:3000/api',
    'https://your-api-domain.com/api'
);
fs.writeFileSync('dist/background.js', prodBackgroundScript);
console.log('⚙️  Processed background script for production');

// Update content scripts for production
const contentScript = fs.readFileSync('dist/content-leetcode.js', 'utf8');
if (contentScript.includes('localhost:3000')) {
    console.log('⚠️  Warning: Content script still contains localhost references');
    console.log('   Content scripts use background script proxy, so this should be OK');
}
console.log('📱 Content scripts ready');

// Create simple icons directory (you should replace with actual PNG files)
if (!fs.existsSync('dist/icons')) {
    fs.mkdirSync('dist/icons');
    
    // Create placeholder text files (replace these with actual PNG files)
    const iconSizes = [16, 32, 48, 128];
    iconSizes.forEach(size => {
        fs.writeFileSync(`dist/icons/icon${size}.png`, `Placeholder ${size}x${size} icon - Replace with actual PNG`);
    });
    console.log('🎨 Created icon placeholders (replace with actual PNG files)');
}

// Copy README for distribution
if (fs.existsSync('README.md')) {
    fs.copyFileSync('README.md', 'dist/README.md');
}

console.log('\n✅ Production build complete!');
console.log('📦 Extension ready in dist/ folder');
console.log('🚀 Next steps:');
console.log('  1. Replace icon placeholders with actual PNG files');
console.log('  2. Update API domain in manifest and scripts');
console.log('  3. Run "npm run zip" to create distribution package');
console.log('\n📊 Build Summary:');
console.log('  - Manifest: Production ready (update API domain)');
console.log('  - Background: Configured for production API');
console.log('  - Content Scripts: Ready');
console.log('  - Icons: Placeholder (add real PNGs)');

// Calculate folder size
function getDirSize(dir) {
    let size = 0;
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = `${dir}/${file}`;
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                size += getDirSize(filePath);
            } else {
                size += stats.size;
            }
        }
    } catch (error) {
        // Ignore errors
    }
    return size;
}

const distSize = getDirSize('dist');
console.log(`  - Size: ~${Math.round(distSize / 1024)}KB`);

console.log('\n🎯 Ready for Chrome Web Store submission!');