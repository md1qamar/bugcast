import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { collectWorkspaceContext } from './gitContext.js';
import { startAppProxy } from './proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webm': 'video/webm',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};

const ERROR_LINE_PATTERN =
  /(error\b|exception\b|traceback|fatal|err!|eaddrinuse|econnrefused|unhandled|uncaught|failed|status\s+5\d{2}|ts\d{4}:)/i;

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function readJsonBody(req, maxBytes = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

/**
 * Start the BugCast HTTP + WebSocket + Reverse Proxy server.
 */
export function startBugCastServer({
  port = 4173,
  cwd = process.cwd(),
  initialCommand = '',
  initialProxyTarget = '',
  proxyPort = 4174,
  serveStatic = true,
} = {}) {
  let activeChild = null;
  let lastCommand = initialCommand;
  let activeProxy = null;
  const terminalHistory = [];
  const browserHistory = [];
  const MAX_HISTORY = 500;
  const clients = new Set();

  function broadcast(message) {
    const json = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === 1) {
        ws.send(json);
      }
    }
  }

  function pushTerminalEntry(stream, rawText) {
    const clean = stripAnsi(rawText).replace(/\r\n/g, '\n');
    const lines = clean.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const isError = stream === 'stderr' || ERROR_LINE_PATTERN.test(line);
      const entry = {
        id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        stream,
        text: line,
        timestampMs: Date.now(),
        isError,
      };
      terminalHistory.push(entry);
      if (terminalHistory.length > MAX_HISTORY) terminalHistory.shift();
      broadcast({ type: 'terminal:log', payload: entry });
    }
  }

  function sanitizeHeadersMap(rawHeaders) {
    if (!rawHeaders || typeof rawHeaders !== 'object') return undefined;
    const clean = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (/^(authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i.test(k)) {
        clean[k] = '[REDACTED_HEADER]';
      } else {
        clean[k] = String(v).slice(0, 300);
      }
    }
    return Object.keys(clean).length ? clean : undefined;
  }

  function pushBrowserEvent(eventData) {
    const entry = {
      id: `br_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      level: eventData.level || 'error',
      source: eventData.source || 'console',
      message: String(eventData.message || '').slice(0, 2000),
      url: eventData.url ? String(eventData.url).slice(0, 500) : undefined,
      status: typeof eventData.status === 'number' ? eventData.status : undefined,
      method: eventData.method ? String(eventData.method).toUpperCase().slice(0, 12) : undefined,
      requestUrl: eventData.requestUrl ? String(eventData.requestUrl).slice(0, 800) : undefined,
      requestHeaders: sanitizeHeadersMap(eventData.requestHeaders),
      requestBody: eventData.requestBody ? String(eventData.requestBody).slice(0, 2000) : undefined,
      responsePreview: eventData.responsePreview ? String(eventData.responsePreview).slice(0, 1500) : undefined,
      durationMs: typeof eventData.durationMs === 'number' ? eventData.durationMs : undefined,
      timestampMs: Date.now(),
    };
    browserHistory.push(entry);
    if (browserHistory.length > MAX_HISTORY) browserHistory.shift();
    broadcast({ type: 'browser:event', payload: entry });
  }

  function killActiveProcess() {
    if (!activeChild) return;
    const pid = activeChild.pid;
    try {
      if (process.platform === 'win32' && pid) {
        spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        activeChild.kill('SIGTERM');
      }
    } catch {
      // Ignore cleanup errors
    }
    activeChild = null;
    broadcast({ type: 'terminal:status', payload: { running: false, command: lastCommand } });
  }

  async function stopProxy() {
    if (!activeProxy) return;
    const p = activeProxy;
    activeProxy = null;
    try {
      await p.close();
    } catch {
      // Ignore
    }
    broadcast({ type: 'proxy:status', payload: { running: false } });
  }

  async function launchProxy(targetUrl, preferred = proxyPort) {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Proxy target must use http:// or https://');
    }
    await stopProxy();
    activeProxy = await startAppProxy({
      targetUrl: parsed.toString(),
      bugcastPort: port,
      preferredPort: preferred,
      onWireError: (errEv) => pushBrowserEvent(errEv),
    });
    const status = {
      running: true,
      proxyUrl: activeProxy.proxyUrl,
      targetUrl: activeProxy.targetUrl,
    };
    broadcast({ type: 'proxy:status', payload: status });
    return status;
  }

  function runTerminalCommand(cmd) {
    if (!cmd || !cmd.trim()) return;
    if (activeChild) killActiveProcess();

    lastCommand = cmd.trim();
    broadcast({ type: 'terminal:status', payload: { running: true, command: lastCommand } });
    pushTerminalEntry('system', `$ ${lastCommand}`);

    const child = spawn(lastCommand, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    activeChild = child;

    child.stdout?.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      process.stdout.write(chunk);
      pushTerminalEntry('stdout', str);
    });

    child.stderr?.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      process.stderr.write(chunk);
      pushTerminalEntry('stderr', str);
    });

    child.on('close', (code) => {
      if (activeChild === child) activeChild = null;
      const stream = code && code !== 0 ? 'stderr' : 'system';
      pushTerminalEntry(stream, `[Process exited with code ${code ?? 0}]`);
      broadcast({
        type: 'terminal:status',
        payload: { running: false, command: lastCommand, exitCode: code ?? 0 },
      });
    });

    child.on('error', (err) => {
      pushTerminalEntry('stderr', `Failed to start command: ${err.message}`);
      broadcast({ type: 'terminal:status', payload: { running: false, command: lastCommand, exitCode: 1 } });
    });
  }

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const pathname = reqUrl.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        cwd,
        runningCommand: activeChild ? lastCommand : null,
        proxy: activeProxy
          ? { running: true, proxyUrl: activeProxy.proxyUrl, targetUrl: activeProxy.targetUrl }
          : { running: false },
      });
      return;
    }

    if (pathname === '/api/context' && req.method === 'GET') {
      try {
        const context = await collectWorkspaceContext(cwd);
        context.proxy = activeProxy
          ? { running: true, proxyUrl: activeProxy.proxyUrl, targetUrl: activeProxy.targetUrl }
          : { running: false };
        sendJson(res, 200, context);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    // Reverse Proxy management endpoints
    if (pathname === '/api/proxy/start' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 64 * 1024);
        const status = await launchProxy(body.targetUrl);
        sendJson(res, 200, status);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === '/api/proxy/stop' && req.method === 'POST') {
      await stopProxy();
      sendJson(res, 200, { running: false });
      return;
    }

    // Rich JS Bridge capturing console.error, window.onerror, unhandledrejection, fetch & XHR (with headers/body/response preview)
    if (pathname === '/bridge.js' && req.method === 'GET') {
      const origin = `http://127.0.0.1:${port}`;
      const script = `(function(){
  if (window.__BUGCAST_BRIDGE_ACTIVE__) return;
  window.__BUGCAST_BRIDGE_ACTIVE__ = true;
  var ENDPOINT = "${origin}/api/browser-event";
  function send(payload){
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function(){});
    } catch(e){}
  }
  function extractHeaders(rawHeaders){
    var out = {};
    if (!rawHeaders) return out;
    try {
      if (typeof rawHeaders.forEach === "function") {
        rawHeaders.forEach(function(v, k){ out[k] = v; });
      } else if (Array.isArray(rawHeaders)) {
        rawHeaders.forEach(function(pair){ if (pair && pair.length >= 2) out[pair[0]] = pair[1]; });
      } else if (typeof rawHeaders === "object") {
        Object.keys(rawHeaders).forEach(function(k){ out[k] = String(rawHeaders[k]); });
      }
    } catch(e){}
    return out;
  }
  function stringifyBody(body){
    if (body == null) return undefined;
    if (typeof body === "string") return body.slice(0, 2000);
    try { return JSON.stringify(body).slice(0, 2000); } catch(e){ return "[unserializable body]"; }
  }
  var origError = console.error;
  console.error = function(){
    var msg = Array.prototype.slice.call(arguments).map(function(a){
      if (a instanceof Error) return a.stack || a.message;
      try { return typeof a === "object" ? JSON.stringify(a) : String(a); } catch(e){ return String(a); }
    }).join(" ");
    send({ level: "error", source: "console.error", message: msg, url: location.href });
    return origError.apply(console, arguments);
  };
  window.addEventListener("error", function(ev){
    send({ level: "error", source: "window.onerror", message: ev.message + " (" + ev.filename + ":" + ev.lineno + ")", url: location.href });
  });
  window.addEventListener("unhandledrejection", function(ev){
    var reason = ev.reason instanceof Error ? (ev.reason.stack || ev.reason.message) : String(ev.reason);
    send({ level: "error", source: "unhandledrejection", message: reason, url: location.href });
  });
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init){
      var rawUrl = typeof input === "string" ? input : (input && input.url ? input.url : "unknown");
      if (rawUrl.indexOf("${origin}/api/browser-event") === 0) return origFetch.apply(this, arguments);
      var fullUrl = rawUrl;
      try { fullUrl = new URL(rawUrl, location.href).toString(); } catch(e){}
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      var reqHeaders = extractHeaders((init && init.headers) || (input && input.headers));
      var reqBody = stringifyBody(init && init.body);
      var t0 = Date.now();
      return origFetch.apply(this, arguments).then(function(resp){
        if (!resp.ok) {
          var dur = Date.now() - t0;
          try {
            resp.clone().text().then(function(txt){
              send({
                level: "error",
                source: "fetch",
                status: resp.status,
                method: method,
                requestUrl: fullUrl,
                requestHeaders: reqHeaders,
                requestBody: reqBody,
                responsePreview: (txt || "").slice(0, 1500),
                durationMs: dur,
                message: method + " " + fullUrl + " -> HTTP " + resp.status + " " + resp.statusText,
                url: location.href
              });
            }).catch(function(){
              send({ level: "error", source: "fetch", status: resp.status, method: method, requestUrl: fullUrl, requestHeaders: reqHeaders, requestBody: reqBody, durationMs: dur, message: method + " " + fullUrl + " -> HTTP " + resp.status, url: location.href });
            });
          } catch(e){
            send({ level: "error", source: "fetch", status: resp.status, method: method, requestUrl: fullUrl, durationMs: dur, message: method + " " + fullUrl + " -> HTTP " + resp.status, url: location.href });
          }
        }
        return resp;
      }, function(err){
        send({
          level: "error",
          source: "fetch",
          status: 0,
          method: method,
          requestUrl: fullUrl,
          requestHeaders: reqHeaders,
          requestBody: reqBody,
          durationMs: Date.now() - t0,
          message: method + " " + fullUrl + " -> Network Failure: " + (err && err.message ? err.message : err),
          url: location.href
        });
        throw err;
      });
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function(method, url){
    this.__bcMethod = String(method || "GET").toUpperCase();
    try { this.__bcUrl = new URL(url, location.href).toString(); } catch(e){ this.__bcUrl = String(url); }
    this.__bcHeaders = {};
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(k, v){
    if (this.__bcHeaders) this.__bcHeaders[k] = String(v);
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body){
    var xhr = this;
    var t0 = Date.now();
    var reqBody = stringifyBody(body);
    xhr.addEventListener("loadend", function(){
      if (xhr.__bcUrl && xhr.__bcUrl.indexOf("${origin}/api/browser-event") === 0) return;
      if (xhr.status >= 400 || xhr.status === 0) {
        send({
          level: "error",
          source: "xhr",
          status: xhr.status,
          method: xhr.__bcMethod || "GET",
          requestUrl: xhr.__bcUrl,
          requestHeaders: xhr.__bcHeaders,
          requestBody: reqBody,
          responsePreview: typeof xhr.responseText === "string" ? xhr.responseText.slice(0, 1500) : undefined,
          durationMs: Date.now() - t0,
          message: (xhr.__bcMethod || "GET") + " " + (xhr.__bcUrl || "") + " -> HTTP " + xhr.status,
          url: location.href
        });
      }
    });
    return origSend.apply(this, arguments);
  };
  console.info("[BugCast Bridge] Active on " + location.origin);
})();`;
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(script);
      return;
    }

    if (pathname === '/api/browser-event' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 512 * 1024);
        pushBrowserEvent(body);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === '/api/ai/analyze' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 2 * 1024 * 1024);
        const model = body.model || 'llama3.2';
        const prompt = `You are a senior software engineer analyzing a recorded bug session.
Return ONLY valid JSON with keys: title, severity (one of: low, medium, high, critical), summary, stepsToReproduce (array of strings), expectedBehavior, actualBehavior, rootCauseHint.

Voice Transcript:
${body.transcript || '(none)'}

Terminal Logs & Errors:
${String(body.terminalLogs || '').slice(-3500) || '(none)'}

Browser Console & Network Failures:
${String(body.browserLogs || '').slice(-2000) || '(none)'}

Git Diff Summary:
${String(body.gitDiff || '').slice(0, 1500) || '(none)'}
`;

        const ollamaRes = await fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, format: 'json', stream: false }),
        });

        if (!ollamaRes.ok) {
          sendJson(res, 502, { error: `Ollama returned HTTP ${ollamaRes.status}` });
          return;
        }

        const data = await ollamaRes.json();
        const parsed = JSON.parse(data.response || '{}');
        sendJson(res, 200, { ok: true, model, analysis: parsed });
      } catch (err) {
        sendJson(res, 500, { error: `AI analysis failed: ${err.message}` });
      }
      return;
    }

    if (pathname === '/api/save-bundle' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 120 * 1024 * 1024);
        const safeId = String(body.id || `session-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
        const bundleDir = path.join(cwd, '.bugcast', safeId);
        fs.mkdirSync(bundleDir, { recursive: true });

        const savedFiles = [];
        if (body.markdown) {
          fs.writeFileSync(path.join(bundleDir, 'ISSUE.md'), String(body.markdown), 'utf8');
          savedFiles.push('ISSUE.md');
        }
        if (body.htmlBundle) {
          fs.writeFileSync(path.join(bundleDir, 'bug-report.html'), String(body.htmlBundle), 'utf8');
          savedFiles.push('bug-report.html');
        }
        if (body.reportJson) {
          fs.writeFileSync(path.join(bundleDir, 'session.json'), JSON.stringify(body.reportJson, null, 2), 'utf8');
          savedFiles.push('session.json');
        }
        if (body.videoBase64) {
          const base64Data = String(body.videoBase64).replace(/^data:[^;]+;base64,/, '');
          fs.writeFileSync(path.join(bundleDir, 'recording.webm'), Buffer.from(base64Data, 'base64'));
          savedFiles.push('recording.webm');
        }
        if (body.gifBase64) {
          const base64Data = String(body.gifBase64).replace(/^data:[^;]+;base64,/, '');
          fs.writeFileSync(path.join(bundleDir, 'recording.gif'), Buffer.from(base64Data, 'base64'));
          savedFiles.push('recording.gif');
        }
        if (Array.isArray(body.screenshots)) {
          body.screenshots.forEach((shot, idx) => {
            if (!shot || !shot.dataUrl) return;
            const base64Data = String(shot.dataUrl).replace(/^data:[^;]+;base64,/, '');
            const fname = `screenshot-${idx + 1}.png`;
            fs.writeFileSync(path.join(bundleDir, fname), Buffer.from(base64Data, 'base64'));
            savedFiles.push(fname);
          });
        }

        sendJson(res, 200, {
          ok: true,
          bundlePath: bundleDir,
          relativePath: path.relative(cwd, bundleDir),
          savedFiles,
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === '/api/create-gh-issue' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 1024 * 1024);
        const issueTitle = String(body.title || 'Bug Report').slice(0, 200);
        const issueBody = String(body.markdown || '');
        const tmpFile = path.join(cwd, '.bugcast', `.tmp-issue-${Date.now()}.md`);
        fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
        fs.writeFileSync(tmpFile, issueBody, 'utf8');

        execFile('gh', ['issue', 'create', '--title', issueTitle, '--body-file', tmpFile], { cwd, timeout: 15000 }, (err, stdout, stderr) => {
          try { fs.unlinkSync(tmpFile); } catch {}
          if (err) {
            sendJson(res, 500, { error: stderr || err.message });
            return;
          }
          sendJson(res, 200, { ok: true, issueUrl: stdout.trim() });
        });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (serveStatic && req.method === 'GET') {
      if (!fs.existsSync(DIST_DIR)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('BugCast production build not found. Run "npm run build" first.');
        return;
      }

      const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);
      if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);

    ws.send(JSON.stringify({
      type: 'init',
      payload: {
        terminalLogs: terminalHistory,
        browserEvents: browserHistory,
        running: Boolean(activeChild),
        command: lastCommand,
        proxy: activeProxy
          ? { running: true, proxyUrl: activeProxy.proxyUrl, targetUrl: activeProxy.targetUrl }
          : { running: false },
      },
    }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8'));
        if (msg.type === 'terminal:run' && typeof msg.command === 'string') {
          runTerminalCommand(msg.command);
        } else if (msg.type === 'terminal:kill') {
          killActiveProcess();
        } else if (msg.type === 'terminal:restart' && lastCommand) {
          runTerminalCommand(lastCommand);
        } else if (msg.type === 'terminal:clear') {
          terminalHistory.length = 0;
          browserHistory.length = 0;
          broadcast({ type: 'terminal:cleared' });
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', async () => {
      try {
        if (initialCommand) {
          runTerminalCommand(initialCommand);
        }
        if (initialProxyTarget) {
          await launchProxy(initialProxyTarget, proxyPort);
        }
        resolve({
          server,
          wss,
          killActiveProcess,
          stopProxy,
          runTerminalCommand,
          getProxyStatus: () =>
            activeProxy
              ? { running: true, proxyUrl: activeProxy.proxyUrl, targetUrl: activeProxy.targetUrl }
              : { running: false },
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const port = Number(process.env.PORT || 4173);
  const serveStatic = process.env.DEV_MODE !== '1';
  startBugCastServer({ port, serveStatic }).then(({ killActiveProcess, stopProxy }) => {
    console.log(`[BugCast Server] Listening on http://127.0.0.1:${port} (static=${serveStatic})`);
    const shutdown = async () => {
      killActiveProcess();
      await stopProxy();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
