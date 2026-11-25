import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';

/**
 * Start a zero-edit local reverse proxy in front of any target URL (e.g. http://localhost:5173).
 * Injects BugCast's /bridge.js into HTML pages, forwards WebSockets (Vite/Next HMR),
 * and reports HTTP >= 400 errors on the wire.
 */
export function startAppProxy({
  targetUrl,
  bugcastPort = 4173,
  preferredPort = 4174,
  onWireError,
}) {
  const parsedTarget = new URL(targetUrl);
  const isHttps = parsedTarget.protocol === 'https:';
  const targetPort = Number(parsedTarget.port) || (isHttps ? 443 : 80);
  const targetHost = parsedTarget.hostname;
  const bridgeTag = `<script src="http://127.0.0.1:${bugcastPort}/bridge.js"></script>`;

  const server = http.createServer((clientReq, clientRes) => {
    const startMs = Date.now();
    const reqPath = clientReq.url || '/';
    const headers = { ...clientReq.headers };
    headers.host = parsedTarget.host;
    // Request uncompressed HTML so bridge injection is clean
    headers['accept-encoding'] = 'identity';

    const transport = isHttps ? https : http;
    const upstreamReq = transport.request(
      {
        hostname: targetHost,
        port: targetPort,
        path: reqPath,
        method: clientReq.method,
        headers,
        rejectUnauthorized: false,
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode || 200;
        const contentType = String(upstreamRes.headers['content-type'] || '');
        const isHtml = contentType.includes('text/html');

        if (status >= 400 && onWireError && !reqPath.includes('/bridge.js')) {
          onWireError({
            level: 'error',
            source: 'proxy-http',
            status,
            method: clientReq.method || 'GET',
            requestUrl: new URL(reqPath, parsedTarget).toString(),
            message: `${clientReq.method || 'GET'} ${reqPath} -> HTTP ${status}`,
            durationMs: Date.now() - startMs,
            url: new URL(reqPath, parsedTarget).toString(),
          });
        }

        if (!isHtml) {
          clientRes.writeHead(status, upstreamRes.headers);
          upstreamRes.pipe(clientRes);
          return;
        }

        const chunks = [];
        upstreamRes.on('data', (c) => chunks.push(c));
        upstreamRes.on('end', () => {
          let html = Buffer.concat(chunks).toString('utf8');
          if (!html.includes('bridge.js')) {
            if (/<\/head>/i.test(html)) {
              html = html.replace(/<\/head>/i, `${bridgeTag}</head>`);
            } else if (/<\/body>/i.test(html)) {
              html = html.replace(/<\/body>/i, `${bridgeTag}</body>`);
            } else {
              html = `${bridgeTag}${html}`;
            }
          }

          const outHeaders = { ...upstreamRes.headers };
          delete outHeaders['content-length'];
          delete outHeaders['content-encoding'];
          delete outHeaders['content-security-policy'];
          delete outHeaders['x-frame-options'];
          outHeaders['content-type'] = 'text/html; charset=utf-8';

          clientRes.writeHead(status, outHeaders);
          clientRes.end(html);
        });
      }
    );

    upstreamReq.on('error', (err) => {
      if (onWireError) {
        onWireError({
          level: 'error',
          source: 'proxy-network',
          status: 0,
          method: clientReq.method || 'GET',
          requestUrl: new URL(reqPath, parsedTarget).toString(),
          message: `Upstream unreachable (${targetUrl}): ${err.message}`,
          durationMs: Date.now() - startMs,
        });
      }
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      clientRes.end(`BugCast Proxy Error: Could not reach ${targetUrl} (${err.message})`);
    });

    clientReq.pipe(upstreamReq);
  });

  // Tunnel WebSockets (HMR / Socket.io) cleanly
  server.on('upgrade', (req, clientSocket, head) => {
    const connectOpts = { host: targetHost, port: targetPort, rejectUnauthorized: false };
    const upstreamSocket = isHttps
      ? tls.connect(connectOpts)
      : net.connect(targetPort, targetHost);

    upstreamSocket.on('connect', () => {
      const headerLines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const key = req.rawHeaders[i];
        const val = key.toLowerCase() === 'host' ? parsedTarget.host : req.rawHeaders[i + 1];
        headerLines.push(`${key}: ${val}`);
      }
      upstreamSocket.write(`${headerLines.join('\r\n')}\r\n\r\n`);
      if (head && head.length) upstreamSocket.write(head);
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
    });

    const destroyBoth = () => {
      try { clientSocket.destroy(); } catch {}
      try { upstreamSocket.destroy(); } catch {}
    };
    upstreamSocket.on('error', destroyBoth);
    clientSocket.on('error', destroyBoth);
  });

  return new Promise((resolve, reject) => {
    const tryListen = (portToTry, attemptsLeft) => {
      const onError = (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
          tryListen(portToTry + 1, attemptsLeft - 1);
          return;
        }
        reject(err);
      };
      server.once('error', onError);
      server.listen(portToTry, '127.0.0.1', () => {
        server.removeListener('error', onError);
        const addr = server.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : portToTry;
        resolve({
          server,
          proxyUrl: `http://127.0.0.1:${actualPort}`,
          targetUrl: parsedTarget.toString().replace(/\/$/, ''),
          close: () =>
            new Promise((done) => {
              server.close(() => done());
            }),
        });
      });
    };
    tryListen(preferredPort, 10);
  });
}
