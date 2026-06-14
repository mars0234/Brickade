const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { execSync } = require('child_process');

console.log('Preparing obfuscated Firebase Hosting build...');

if (fs.existsSync('./public')) {
  fs.rmSync('./public', { recursive: true, force: true });
}
fs.mkdirSync('./public');

fs.cpSync('./src', './public', { recursive: true });
console.log('Copied source assets to public.');

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
};

function obfuscateFile(fileName) {
  const sourcePath = `./src/${fileName}`;
  const targetPath = `./public/${fileName}`;

  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const sourceCode = fs.readFileSync(sourcePath, 'utf8');
  const obfuscatedCode = JavaScriptObfuscator
    .obfuscate(sourceCode, obfuscatorOptions)
    .getObfuscatedCode();

  fs.writeFileSync(targetPath, obfuscatedCode);
  console.log(`Obfuscated ${fileName}.`);
}

obfuscateFile('game.js');
obfuscateFile('ai_worker.js');

console.log('Deploying to Firebase Hosting...');

try {
  execSync('firebase deploy --only hosting', { stdio: 'inherit' });
  console.log('Firebase Hosting deploy complete.');
} catch (error) {
  console.warn('Global Firebase CLI failed; retrying with npx firebase-tools...');

  try {
    execSync('npx firebase-tools deploy --only hosting', { stdio: 'inherit' });
    console.log('Firebase Hosting deploy complete.');
  } catch (fallbackError) {
    console.error('Firebase Hosting deploy failed.');
    process.exitCode = fallbackError.status || 1;
  }
}
