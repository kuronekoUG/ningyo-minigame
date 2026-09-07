import { spawn } from 'node:child_process';
import { join } from 'node:path';

const wrangler = join(
  process.cwd(),
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
const child = spawn(
  process.execPath,
  [
    wrangler,
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--config',
    'wrangler.local.jsonc',
    '--persist-to',
    '.wrangler/state',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WRANGLER_WRITE_LOGS: 'false',
      WRANGLER_LOG_PATH: join(process.cwd(), '.wrangler', 'logs'),
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
