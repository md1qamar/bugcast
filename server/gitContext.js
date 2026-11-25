import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

let cachedGitBin = null;

/**
 * Locate git binary across PATH and common Windows installation paths.
 */
function findGitBinary() {
  if (cachedGitBin !== null) return cachedGitBin;

  const candidates = ['git'];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe')
    );
  }

  for (const bin of candidates) {
    try {
      if (bin !== 'git' && !fs.existsSync(bin)) continue;
      execFileSync(bin, ['--version'], { stdio: 'ignore', timeout: 1500 });
      cachedGitBin = bin;
      return bin;
    } catch {
      // Try next candidate
    }
  }

  cachedGitBin = '';
  return '';
}

function runGit(args, cwd) {
  const gitBin = findGitBinary();
  if (!gitBin) return '';
  try {
    return execFileSync(gitBin, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2500,
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Pure-JS fallback if git CLI is not installed but .git folder exists.
 */
function readGitHeadFallback(cwd) {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    const headPath = path.join(dir, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const content = fs.readFileSync(headPath, 'utf8').trim();
      const match = content.match(/^ref:\s+refs\/heads\/(.+)$/);
      if (match) {
        const branch = match[1];
        const refPath = path.join(dir, '.git', 'refs', 'heads', branch);
        const commit = fs.existsSync(refPath)
          ? fs.readFileSync(refPath, 'utf8').trim().slice(0, 7)
          : '';
        return { branch, commit };
      }
      return { branch: 'detached', commit: content.slice(0, 7) };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { branch: '', commit: '' };
}

function readPackageMetadata(cwd) {
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    const notable = ['react', 'next', 'vite', 'vue', 'svelte', 'express', 'fastify', 'typescript', 'tailwindcss', 'prisma', 'drizzle-orm']
      .filter((name) => Boolean(allDeps[name]))
      .map((name) => `${name}@${allDeps[name]}`);
    return {
      name: pkg.name || path.basename(cwd),
      version: pkg.version || '',
      frameworks: notable,
    };
  } catch {
    return null;
  }
}

function checkBinaryVersion(bin, args = ['--version']) {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    }).trim().split('\n')[0];
  } catch {
    return '';
  }
}

/**
 * Check if local Ollama API is reachable and list models.
 */
export async function getOllamaStatus() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

function readEnvKeysOnly(cwd) {
  const keys = new Set();
  for (const fname of ['.env', '.env.local', '.env.example']) {
    try {
      const p = path.join(cwd, fname);
      if (!fs.existsSync(p)) continue;
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (m) keys.add(m[1]);
      }
    } catch {
      // Ignore unreadable env files
    }
  }
  return Array.from(keys).slice(0, 30);
}

/**
 * Collect comprehensive workspace, git, runtime, and system context.
 */
export async function collectWorkspaceContext(cwd) {
  let gitBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  let gitCommit = runGit(['rev-parse', '--short', 'HEAD'], cwd);
  const gitRemote = runGit(['config', '--get', 'remote.origin.url'], cwd);
  const gitStatus = runGit(['status', '--short'], cwd);
  const gitLogRaw = runGit(['log', '-n', '3', '--oneline'], cwd);
  const gitDiffStat = runGit(['diff', '--stat'], cwd);
  let gitDiff = runGit(['diff', '--no-color'], cwd);

  if (!gitBranch) {
    const fallback = readGitHeadFallback(cwd);
    gitBranch = fallback.branch;
    gitCommit = gitCommit || fallback.commit;
  }

  if (gitDiff.length > 6000) {
    gitDiff = `${gitDiff.slice(0, 6000)}\n\n... [diff truncated at 6000 chars]`;
  }

  const dirtyFiles = gitStatus
    ? gitStatus.split(/\r?\n/).filter(Boolean).slice(0, 20)
    : [];
  const recentCommits = gitLogRaw
    ? gitLogRaw.split(/\r?\n/).filter(Boolean).slice(0, 3)
    : [];

  const pkg = readPackageMetadata(cwd);
  const envKeys = readEnvKeysOnly(cwd);
  const pythonVersion = checkBinaryVersion('python', ['--version']) || checkBinaryVersion('python3', ['--version']);
  const ghVersion = checkBinaryVersion('gh', ['--version']);
  const ollama = await getOllamaStatus();

  return {
    cwd,
    projectName: pkg?.name || path.basename(cwd),
    projectVersion: pkg?.version || '',
    frameworks: pkg?.frameworks || [],
    envKeys,
    git: {
      branch: gitBranch || undefined,
      commit: gitCommit || undefined,
      remote: gitRemote || undefined,
      recentCommits,
      dirtyFiles,
      diffStat: gitDiffStat || undefined,
      diff: gitDiff || undefined,
    },
    runtime: {
      nodeVersion: process.version,
      pythonVersion: pythonVersion || undefined,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      cpuModel: os.cpus()?.[0]?.model || 'Unknown CPU',
      cpuCores: os.cpus()?.length || 0,
      totalMemoryGb: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
      ghCliAvailable: Boolean(ghVersion),
    },
    ai: {
      ollamaAvailable: ollama.available,
      ollamaModels: ollama.models,
    },
  };
}
