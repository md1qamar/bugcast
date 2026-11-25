import { BugReport } from '../types';
import { redactBugReport, RedactOptions } from './secretRedactor';
import { generateCurlCommand } from './reproGenerator';
import { generateAiFixPrompt, generateGitHubIssueMarkdown } from './markdownGenerator';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

/**
 * Generate a 100% self-contained offline interactive HTML bug report with embedded video,
 * synced clickable error timeline, redacted cURL repros, and git diff.
 */
export function generateInteractiveHtmlBundle(
  rawReport: BugReport,
  videoDataUrl?: string,
  redactOptions: RedactOptions = { redactSecrets: true, redactEmails: false }
): string {
  const { report, totalRedactions } = redactBugReport(rawReport, redactOptions);
  const markdown = generateGitHubIssueMarkdown(report, { redactOptions });
  const aiPrompt = generateAiFixPrompt(report, redactOptions);

  const curls = (report.browserEvents || [])
    .map((ev) => ({ ev, curl: generateCurlCommand(ev) }))
    .filter((item): item is { ev: typeof item.ev; curl: string } => Boolean(item.curl));

  const timelineItems = [
    ...(report.events || []).map((e) => ({
      time: e.timestampSeconds || 0,
      kind: 'event',
      label: e.title,
      detail: e.description || '',
    })),
    ...(report.terminalLogs || [])
      .filter((l) => l.isError)
      .map((l) => ({
        time: typeof l.offsetSeconds === 'number' ? l.offsetSeconds : 0,
        kind: 'terminal',
        label: '[Terminal Error]',
        detail: l.text,
      })),
    ...(report.browserEvents || []).map((b) => ({
      time: typeof b.offsetSeconds === 'number' ? b.offsetSeconds : 0,
      kind: 'browser',
      label: b.status ? `[HTTP ${b.status}]` : `[${b.source}]`,
      detail: b.message,
    })),
  ].sort((a, b) => a.time - b.time);

  const bundlePayload = {
    timelineItems,
    markdown,
    aiPrompt,
    curls: curls.map((c) => ({
      message: c.ev.message,
      status: c.ev.status,
      responsePreview: c.ev.responsePreview || '',
      curl: c.curl,
    })),
  };

  const severityColor =
    report.severity === 'critical' || report.severity === 'high' ? '#ef4444' : '#f59e0b';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BugCast Replay — ${escapeHtml(report.title || 'Bug Report')}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0b0f17; color: #e2e8f0; line-height: 1.5;
    }
    .container { max-width: 1220px; margin: 0 auto; padding: 24px; }
    .header {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;
      padding: 18px 20px; background: #111827; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
      margin-bottom: 20px;
    }
    .badge {
      display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
      font-family: ui-monospace, monospace; text-transform: uppercase;
    }
    .grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 20px; align-items: start; }
    @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: #111827; border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; padding: 16px;
    }
    video { width: 100%; border-radius: 12px; background: #000; display: block; }
    .btn {
      cursor: pointer; border: 1px solid rgba(255,255,255,0.14); background: #1f2937; color: #f8fafc;
      padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 600;
    }
    .btn:hover { background: #374151; }
    .btn-primary { background: #22c55e; color: #052e16; border-color: #22c55e; }
    .btn-primary:hover { background: #4ade80; }
    .tabs { display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .tab-btn { background: transparent; border: 0; color: #94a3b8; font-weight: 600; font-size: 12px; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
    .tab-btn.active { background: rgba(34,197,94,0.15); color: #4ade80; }
    .timeline-row {
      width: 100%; text-align: left; display: flex; gap: 10px; align-items: flex-start;
      padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);
      background: #0d1320; color: #e2e8f0; cursor: pointer; margin-bottom: 6px; font-family: ui-monospace, monospace; font-size: 11px;
    }
    .timeline-row:hover { border-color: rgba(34,197,94,0.5); }
    .time-pill { color: #4ade80; font-weight: 700; flex-shrink: 0; }
    pre {
      background: #070a0f; border: 1px solid rgba(255,255,255,0.06); padding: 12px; border-radius: 10px;
      overflow: auto; font-size: 11px; color: #a7f3d0; max-height: 360px; white-space: pre-wrap; word-break: break-word;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="badge" style="background:${severityColor}22;color:${severityColor};border:1px solid ${severityColor}55;">${escapeHtml(report.severity)}</span>
          <span class="badge" style="background:rgba(34,197,94,0.15);color:#4ade80;">BugCast Offline Bundle</span>
          ${totalRedactions > 0 ? `<span class="badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;">${totalRedactions} Secret(s) Redacted</span>` : ''}
        </div>
        <h1 style="margin:0;font-size:20px;color:#fff;">${escapeHtml(report.title || 'Untitled Bug Report')}</h1>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;font-family:ui-monospace,monospace;">
          ${escapeHtml(report.diagnostics.os)} · ${escapeHtml(report.diagnostics.browser)} · ${report.diagnostics.gitBranch ? `Branch: ${escapeHtml(report.diagnostics.gitBranch)}` : ''} · Recorded ${escapeHtml(new Date(report.createdAt).toLocaleString())}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" id="copy-ai-btn">Copy AI Fix Prompt</button>
        <button class="btn btn-primary" id="copy-md-btn">Copy GitHub Markdown</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        ${
          videoDataUrl
            ? `<video id="player" controls playsinline src="${videoDataUrl}"></video>`
            : report.screenshots && report.screenshots.length > 0
              ? `<img src="${report.screenshots[0].dataUrl}" alt="Bug Screenshot" style="width:100%;border-radius:12px;display:block;border:1px solid rgba(255,255,255,0.1);" />`
              : `<div style="padding:48px;text-align:center;color:#64748b;background:#070a0f;border-radius:12px;">No video or screenshot attached in this bundle.</div>`
        }
        ${
          report.screenshots && report.screenshots.length > 0
            ? `<h3 style="margin:16px 0 8px;font-size:13px;color:#fff;">Captured Screenshots (${report.screenshots.length})</h3>
               <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">
                 ${report.screenshots
                   .map(
                     (s, idx) =>
                       `<a href="${s.dataUrl}" download="screenshot-${idx + 1}.png" title="Click to download PNG" style="display:block;border:1px solid rgba(255,255,255,0.12);border-radius:10px;overflow:hidden;background:#000;"><img src="${s.dataUrl}" alt="Screenshot ${idx + 1}" style="width:100%;display:block;" /></a>`
                   )
                   .join('')}
               </div>`
            : ''
        }
        <h3 style="margin:16px 0 8px;font-size:13px;color:#fff;">Click Any Synced Event or Error to Seek Video</h3>
        <div id="timeline-list" style="max-height:260px;overflow-y:auto;"></div>
      </div>

      <div class="card">
        <div class="tabs">
          <button class="tab-btn active" data-tab="summary">Summary &amp; Steps</button>
          <button class="tab-btn" data-tab="curls">cURL Repros (${curls.length})</button>
          <button class="tab-btn" data-tab="logs">Terminal Logs (${(report.terminalLogs || []).length})</button>
          <button class="tab-btn" data-tab="diff">Git Diff</button>
        </div>

        <div id="tab-summary">
          <p style="font-size:13px;margin-top:0;">${escapeHtml(report.description || 'No description provided.')}</p>
          ${report.rootCauseHint ? `<p style="font-size:12px;color:#c084fc;font-family:ui-monospace,monospace;">Root Cause Clue: ${escapeHtml(report.rootCauseHint)}</p>` : ''}
          <h4 style="font-size:12px;color:#94a3b8;text-transform:uppercase;">Steps to Reproduce</h4>
          <ol style="font-size:12px;padding-left:18px;">
            ${(report.stepsToReproduce || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('') || '<li>See attached recording</li>'}
          </ol>
        </div>

        <div id="tab-curls" class="hidden"></div>
        <div id="tab-logs" class="hidden">
          <pre>${escapeHtml((report.terminalLogs || []).map((l) => `[${l.stream}] ${l.text}`).join('\n') || report.consoleLogs || 'No terminal logs captured.')}</pre>
        </div>
        <div id="tab-diff" class="hidden">
          <pre>${escapeHtml(report.gitDiff || 'No uncommitted git diff captured.')}</pre>
        </div>
      </div>
    </div>
  </div>

  <script id="bugcast-data" type="application/json">${safeJsonScript(bundlePayload)}</script>
  <script>
    (function(){
      var data = JSON.parse(document.getElementById('bugcast-data').textContent || '{}');
      var player = document.getElementById('player');
      function fmt(secs){
        var m = Math.floor(secs / 60), s = Math.floor(secs % 60);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }

      var list = document.getElementById('timeline-list');
      (data.timelineItems || []).forEach(function(item){
        var btn = document.createElement('button');
        btn.className = 'timeline-row';
        var timeSpan = document.createElement('span');
        timeSpan.className = 'time-pill';
        timeSpan.textContent = fmt(item.time || 0);
        var textSpan = document.createElement('span');
        textSpan.textContent = item.label + (item.detail ? ' — ' + item.detail : '');
        btn.appendChild(timeSpan);
        btn.appendChild(textSpan);
        btn.addEventListener('click', function(){
          if (player) { player.currentTime = item.time || 0; player.play(); }
        });
        list.appendChild(btn);
      });

      var curlsWrap = document.getElementById('tab-curls');
      if ((data.curls || []).length === 0) {
        curlsWrap.innerHTML = '<p style="font-size:12px;color:#64748b;">No failed HTTP requests captured.</p>';
      } else {
        data.curls.forEach(function(item){
          var block = document.createElement('div');
          block.style.marginBottom = '12px';
          var pre = document.createElement('pre');
          pre.textContent = item.curl + (item.responsePreview ? '\\n\\n# Response:\\n' + item.responsePreview : '');
          var copyBtn = document.createElement('button');
          copyBtn.className = 'btn';
          copyBtn.textContent = 'Copy cURL';
          copyBtn.addEventListener('click', function(){
            navigator.clipboard.writeText(item.curl).then(function(){
              copyBtn.textContent = 'Copied!';
              setTimeout(function(){ copyBtn.textContent = 'Copy cURL'; }, 1500);
            });
          });
          block.appendChild(copyBtn);
          block.appendChild(pre);
          curlsWrap.appendChild(block);
        });
      }

      document.querySelectorAll('.tab-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          var target = btn.getAttribute('data-tab');
          ['summary','curls','logs','diff'].forEach(function(t){
            document.getElementById('tab-' + t).classList.toggle('hidden', t !== target);
          });
        });
      });

      document.getElementById('copy-md-btn').addEventListener('click', function(){
        var b = this;
        navigator.clipboard.writeText(data.markdown || '').then(function(){
          b.textContent = 'Copied!';
          setTimeout(function(){ b.textContent = 'Copy GitHub Markdown'; }, 2000);
        });
      });
      document.getElementById('copy-ai-btn').addEventListener('click', function(){
        var b = this;
        navigator.clipboard.writeText(data.aiPrompt || '').then(function(){
          b.textContent = 'Copied Prompt!';
          setTimeout(function(){ b.textContent = 'Copy AI Fix Prompt'; }, 2000);
        });
      });
    })();
  </script>
</body>
</html>`;
}
