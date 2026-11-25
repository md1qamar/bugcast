import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { startBugCastServer } from '../server/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

async function startDev() {
  const { killActiveProcess, stopProxy } = await startBugCastServer({
    port: 4173,
    cwd: root,
    serveStatic: false,
  });

  console.log('[BugCast Dev] Backend WS/API running on http://127.0.0.1:4173');

  const viteBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  const vite = spawn(viteBin, ['--port', '3000'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const shutdown = async () => {
    killActiveProcess();
    await stopProxy();
    vite.kill();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  vite.on('exit', async (code) => {
    killActiveProcess();
    await stopProxy();
    process.exit(code ?? 0);
  });
}

startDev().catch((err) => {
  console.error(err);
  process.exit(1);
});
