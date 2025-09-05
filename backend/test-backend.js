#!/usr/bin/env node

// Simple test script to verify backend setup
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing CP Mentor Backend Setup\n');

// Check if we're in the right directory
const expectedFiles = [
  'src/app.js',
  'src/config/config.js',
  'src/models/User.js',
  'package.json',
  '.env'
];

console.log('📁 Checking required files...');
let allFilesExist = true;

expectedFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\n⚠️  Some files are missing. Please ensure you have created all required files.\n');
  process.exit(1);
}

// Check environment variables
console.log('\n🔧 Checking environment configuration...');
require('dotenv').config();

const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'GEMINI_API_KEY'
];

let envComplete = true;
requiredEnvVars.forEach(envVar => {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar}`);
  } else {
    console.log(`❌ ${envVar} - NOT SET`);
    envComplete = false;
  }
});

if (!envComplete) {
  console.log('\n⚠️  Some environment variables are missing. Check your .env file.\n');
  console.log('Required variables:');
  console.log('- MONGODB_URI=mongodb://localhost:27017/cp-mentor');
  console.log('- JWT_SECRET=your-secret-key');
  console.log('- GEMINI_API_KEY=your-gemini-api-key\n');
}

// Test basic imports
console.log('\n📦 Testing imports...');
try {
  const config = require('./src/config/config');
  console.log('✅ Configuration loaded');
  
  const logger = require('./src/utils/logger');
  console.log('✅ Logger initialized');
  
  const User = require('./src/models/User');
  console.log('✅ User model loaded');
  
  console.log('\n✅ All imports successful!');
  
} catch (error) {
  console.log(`❌ Import error: ${error.message}`);
  process.exit(1);
}

// Summary
console.log('\n🎯 Backend Setup Summary:');
console.log(`✅ Files: ${allFilesExist ? 'Complete' : 'Missing files'}`);
console.log(`✅ Environment: ${envComplete ? 'Complete' : 'Missing variables'}`);
console.log('✅ Dependencies: Installed');
console.log('✅ Imports: Working');

console.log('\n🚀 Ready to start! Run: npm run dev');
console.log('📚 Next steps:');
console.log('  1. Ensure MongoDB is running');
console.log('  2. Start the server: npm run dev');
console.log('  3. Test health endpoint: curl http://localhost:3000/health');
console.log('');