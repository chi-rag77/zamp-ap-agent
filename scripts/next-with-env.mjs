import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const child = spawn(process.execPath, [join(process.cwd(), 'node_modules/next/dist/bin/next'), ...process.argv.slice(2)], {
  env: process.env,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1); });
