'use strict';

const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');

const targets = {
  '1': { label: 'Windows installer and portable .exe', script: 'dist:win', platform: 'win32' },
  '2': { label: 'macOS universal .dmg', script: 'dist:mac', platform: 'darwin' },
};

if (process.platform !== 'win32' && process.platform !== 'darwin') {
  console.error('Run this builder on Windows to create .exe files or on macOS to create the .dmg.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('Mixbox DJ builder');
console.log('1) Windows installer and portable .exe');
console.log('2) macOS universal .dmg');
rl.question('Choose a build (1 or 2): ', choice => {
  rl.close();
  const target = targets[choice.trim()];
  if (!target) {
    console.error('Invalid choice. Enter 1 or 2.');
    process.exitCode = 1;
    return;
  }
  if (target.platform !== process.platform) {
    console.error(`${target.label} must be built on ${target.platform === 'win32' ? 'Windows' : 'macOS'}.`);
    process.exitCode = 1;
    return;
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = args => new Promise((resolve, reject) => {
    const child = spawn(npm, args, { cwd: __dirname, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} exited with code ${code}`)));
  });

  (async () => {
    try {
      console.log('\nInstalling project dependencies...');
      await run(['install']);
      console.log(`\nBuilding ${target.label}...`);
      await run(['run', target.script]);
      console.log('\nBuild complete. See the mixbox/dist folder for the output.');
    } catch (error) {
      console.error(`\nBuild failed: ${error.message}`);
      process.exitCode = 1;
    }
  })();
});
