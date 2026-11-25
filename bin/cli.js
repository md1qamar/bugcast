#!/usr/bin/env node

import { spawn } from 'child_process';
import { startBugCastServer } from '../server/index.js';
import { collectWorkspaceContext } from '../server/gitContext.js';

const args = process.argv.slice(2);
let port = 4173;
let proxyPort = 4174;
let proxyTarget = '';
let shouldOpen = true;
let wrappedCommand = '';

const dashDashIndex = args.indexOf('--');
const cliFlags = dashDashIndex === -1 ? args : args.slice(0, dashDashIndex);
if (dashDashIndex !== -1) {
  wrappedCommand = args.slice(dashDashIndex + 1).join(' ').trim();
}

for (let i = 0; i < cliFlags.length; i++) {
  const flag = cliFlags[i];
  if (flag === '--port' || flag === '-p') {
    const val = Number(cliFlags[i + 1]);
    if (!Number.isNaN(val) && val > 0) {
      port = val;
      i++;
    }
  } else if (flag === '--proxy') {
    proxyTarget = cliFlags[i + 1] || '';
    i++;
  } else if (flag === '--proxy-port') {
    const val = Number(cliFlags[i + 1]);
    if (!Number.isNaN(val) && val > 0) {
      proxyPort = val;
      i++;
    }
  } else if (flag === '--no-open') {
    shouldOpen = false;
  } else if (flag === '--help' || flag === '-h') {
    console.log(`
BugCast CLI - Local-First Screen + Terminal Session Recorder

Usage:
  bugcast [options] [-- <command>]

Options:
  -p, --port <port>      Port for BugCast UI & WebSocket server (default: 4173)
  --proxy <url>          Start zero-edit reverse proxy to capture console & HTTP errors (e.g. http://localhost:5173)
  --proxy-port <port>    Port for reverse proxy (default: 4174)
  --no-open              Do not automatically open the browser
  -h, --help             Show help

Examples:
  bugcast
  bugcast -- npm run dev
  bugcast --proxy http://localhost:5173 -- npm run dev
`);
    process.exit(0);
  }
}

const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  }
}

async function main() {
  const cwd = process.cwd();
  const context = await collectWorkspaceContext(cwd);

  console.log(`\n${green}${bold}BugCast v2.0${reset} ${dim}— Local-First Screen + Terminal Bug Studio${reset}`);
  console.log(` ${yellow}●${reset} Workspace:  ${bold}${context.projectName}${reset} ${dim}(${cwd})${reset}`);
  if (context.git.branch) {
    console.log(` ${yellow}●${reset} Git:        ${bold}${context.git.branch}${reset} ${context.git.commit ? `@ ${context.git.commit}` : ''}`);
  }
  if (context.ai.ollamaAvailable) {
    console.log(` ${green}●${reset} Local AI:   Ollama ready (${context.ai.ollamaModels.slice(0, 3).join(', ') || 'no models pulled'})`);
  }
  if (wrappedCommand) {
    console.log(` ${cyan}●${reset} Wrapping:   ${bold}${wrappedCommand}${reset}`);
  }

  const { killActiveProcess, stopProxy, getProxyStatus } = await startBugCastServer({
    port,
    cwd,
    initialCommand: wrappedCommand,
    initialProxyTarget: proxyTarget,
    proxyPort,
    serveStatic: true,
  });

  const url = `http://127.0.0.1:${port}`;
  const proxyInfo = getProxyStatus();
  console.log(`\n ${green}✔${reset} Studio UI:  ${cyan}${bold}${url}${reset}`);
  if (proxyInfo.running) {
    console.log(` ${green}✔${reset} App Proxy:  ${cyan}${bold}${proxyInfo.proxyUrl}${reset} -> ${proxyInfo.targetUrl}`);
  }
  console.log(` ${dim}Press Ctrl+C to stop server, proxy, and wrapped processes.${reset}\n`);

  if (shouldOpen) {
    openBrowser(url);
  }

  const shutdown = async () => {
    killActiveProcess();
    await stopProxy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to launch BugCast:', err);
  process.exit(1);
});
