// Windows Diagnostic Script
// Run this on Windows: node debug-windows.js

console.log('=== proPACE Windows Diagnostic ===\n');

// 1. Check Node version
console.log('1. Node.js Version:');
console.log('   ' + process.version);
console.log('   Expected: v18 or higher\n');

// 2. Check if we're in the right directory
console.log('2. Current Directory:');
console.log('   ' + process.cwd());
console.log('   Expected: C:\\proPACE\n');

// 3. Check package.json exists and is valid
console.log('3. Package.json:');
try {
  const pkg = await import('./package.json', { assert: { type: 'json' } });
  console.log('   ✓ Found and valid');
  console.log('   Type: ' + pkg.default.type);
  console.log('   Expected: module\n');
} catch (error) {
  console.log('   ✗ ERROR:', error.message);
  console.log('');
}

// 4. Check if .env exists
console.log('4. Environment File (.env):');
import { existsSync } from 'fs';
if (existsSync('.env')) {
  console.log('   ✓ Found\n');
} else {
  console.log('   ✗ NOT FOUND - Server will exit without API key!\n');
}

// 5. Check critical directories
console.log('5. Critical Directories:');
const dirs = ['dist', 'dist/src', 'dist/src/server', 'node_modules', 'logs', 'data'];
for (const dir of dirs) {
  console.log(`   ${dir}: ${existsSync(dir) ? '✓' : '✗ MISSING'}`);
}
console.log('');

// 6. Check if entry point exists
console.log('6. Server Entry Point:');
if (existsSync('dist/src/server/index.js')) {
  console.log('   ✓ dist/src/server/index.js exists\n');
} else {
  console.log('   ✗ dist/src/server/index.js MISSING - Run npm run build!\n');
}

// 7. Check critical dependencies
console.log('7. Critical Dependencies:');
const deps = [
  '@anthropic-ai/sdk',
  'better-sqlite3',
  'ws',
  'dotenv',
  'boxen',
  'chalk'
];

for (const dep of deps) {
  try {
    await import(dep);
    console.log(`   ${dep}: ✓`);
  } catch (error) {
    console.log(`   ${dep}: ✗ MISSING - ${error.message}`);
  }
}
console.log('');

// 8. Try loading config
console.log('8. Configuration Loading:');
try {
  const { config } = await import('./dist/config/index.js');
  console.log('   ✓ Config loaded successfully');
  console.log('   Port:', config.port);
  console.log('   Host:', config.host);
  console.log('   Agent Mode:', config.enableAgentMode);
  console.log('   API Key:', config.anthropicApiKey ? '✓ Set (length: ' + config.anthropicApiKey.length + ')' : '✗ NOT SET');
} catch (error) {
  console.log('   ✗ ERROR loading config:', error.message);
  console.log('   Stack:', error.stack);
}
console.log('');

// 9. Try importing the server class
console.log('9. Server Module Import:');
try {
  const { PACEServer } = await import('./dist/src/server/index.js');
  console.log('   ✓ Server module imported successfully');
} catch (error) {
  console.log('   ✗ ERROR importing server:', error.message);
  console.log('   Stack:', error.stack);
  console.log('\n   This is likely the cause of the silent exit!');
}

console.log('\n=== Diagnostic Complete ===');
