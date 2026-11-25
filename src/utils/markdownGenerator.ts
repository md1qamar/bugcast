import { BugReport } from '../types';
import { redactBugReport, RedactOptions } from './secretRedactor';
import { generateCurlCommand, generatePlaywrightSnippet } from './reproGenerator';

function formatOffset(secs?: number): string {
  if (typeof secs !== 'number' || Number.isNaN(secs)) return '00:00';
  const mins = Math.floor(Math.max(0, secs) / 60);
  const rem = Math.floor(Math.max(0, secs) % 60);
  return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

export interface MarkdownGenOptions {
  savedBundlePath?: string;
  redactOptions?: RedactOptions;
}

export function generateGitHubIssueMarkdown(
  rawReport: BugReport,
  optionsOrPath?: string | MarkdownGenOptions
): string {
  const opts: MarkdownGenOptions =
    typeof optionsOrPath === 'string'
      ? { savedBundlePath: optionsOrPath }
      : optionsOrPath || {};

  const redactOpts = opts.redactOptions || { redactSecrets: true, redactEmails: false };
  const { report, totalRedactions } = redactBugReport(rawReport, redactOpts);

  const severityBadges: Record<BugReport['severity'], string> = {
    low: '🟢 Low',
    medium: '🟡 Medium',
    high: '🟠 High',
    critical: '🔴 Critical',
  };

  const stepsList =
    report.stepsToReproduce.length > 0
      ? report.stepsToReproduce.map((step, idx) => `${idx + 1}. ${step}`).join('\n')
      : '1. Launch the application\n2. Perform the action shown in the recording\n3. Observe the failure';

  const timelineSection =
    report.events.length > 0
      ? `### ⏱️ Synced Timeline & Key Moments
| Timestamp | Event | Details |
| :--- | :--- | :--- |
${report.events
  .map((e) => `| \`${e.formattedTime}\` | **${e.title}** | ${(e.description || '-').replace(/\|/g, '\\|').slice(0, 120)} |`)
  .join('\n')}
`
      : '';

  const failedRequests = (report.browserEvents || [])
    .map((ev) => ({ ev, curl: generateCurlCommand(ev) }))
    .filter((item): item is { ev: typeof item.ev; curl: string } => Boolean(item.curl));

  const curlSection =
    failedRequests.length > 0
      ? `### 🔁 Instant API Reproduction (\`cURL\`)
${failedRequests
  .slice(0, 3)
  .map(
    ({ ev, curl }) => `**${ev.method || 'HTTP'} ${ev.requestUrl || ev.message}** (\`HTTP ${ev.status ?? 0}\` · \`${ev.durationMs ?? 0}ms\`)
\`\`\`bash
${curl}
\`\`\`${
      ev.responsePreview
        ? `\n<details>\n<summary>Server Error Response</summary>\n\n\`\`\`json\n${ev.responsePreview}\n\`\`\`\n</details>\n`
        : ''
    }`
  )
  .join('\n')}
`
      : '';

  const playwrightSnippet = generatePlaywrightSnippet(report, failedRequests[0]?.ev);
  const playwrightSection = `### 🎭 Automated Playwright Repro Stub
<details>
<summary>View Playwright test snippet</summary>

\`\`\`ts
${playwrightSnippet}
\`\`\`
</details>
`;

  const transcriptSection =
    report.transcript && report.transcript.length > 0
      ? `### 🎙️ Voice Narration Transcript
<details>
<summary>Click to view spoken walkthrough (${report.transcript.length} segments)</summary>

${report.transcript.map((t) => `- **\`${t.formattedTime}\`**: ${t.text}`).join('\n')}
</details>
`
      : '';

  const terminalLines = (report.terminalLogs || []).map(
    (l) => `[${formatOffset(l.offsetSeconds)}] [${l.stream.toUpperCase()}] ${l.text}`
  );
  const manualLines = report.consoleLogs.trim() ? [report.consoleLogs.trim()] : [];
  const combinedTerminal = [...terminalLines, ...manualLines].join('\n').trim();

  const terminalSection = combinedTerminal
    ? `### 💻 Terminal & Runtime Logs
<details>
<summary>View captured logs (${combinedTerminal.split('\n').length} lines)</summary>

\`\`\`bash
${combinedTerminal.slice(-6000)}
\`\`\`
</details>
`
    : '';

  const browserSection =
    report.browserEvents && report.browserEvents.length > 0
      ? `### 🌐 Browser Console & Network Failures
<details>
<summary>View ${report.browserEvents.length} captured browser event(s)</summary>

\`\`\`text
${report.browserEvents
  .map((b) => `[${formatOffset(b.offsetSeconds)}] [${b.source}] ${b.message}`)
  .join('\n')}
\`\`\`
</details>
`
      : '';

  const gitDiffSection =
    report.gitDiff && report.gitDiff.trim()
      ? `### 🔀 Uncommitted Workspace Diff
<details>
<summary>View local git diff (${report.dirtyFiles?.length || 0} modified files)</summary>

\`\`\`diff
${report.gitDiff.slice(0, 4000)}
\`\`\`
</details>
`
      : '';

  const extraDiagRows = [
    report.diagnostics.projectName ? `| **Project** | \`${report.diagnostics.projectName}\` |` : '',
    report.diagnostics.nodeVersion ? `| **Node.js** | \`${report.diagnostics.nodeVersion}\` |` : '',
    report.diagnostics.pythonVersion ? `| **Python** | \`${report.diagnostics.pythonVersion}\` |` : '',
    report.diagnostics.gitBranch ? `| **Git Branch** | \`${report.diagnostics.gitBranch}\` |` : '',
    report.diagnostics.gitCommit ? `| **Commit** | \`${report.diagnostics.gitCommit}\` |` : '',
    report.envKeys && report.envKeys.length > 0
      ? `| **Configured Env Keys** | \`${report.envKeys.slice(0, 12).join(', ')}\` *(values never exported)* |`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const attachmentNote = opts.savedBundlePath
    ? `> 💾 Local bundle saved to \`${opts.savedBundlePath}\`. Drag and drop \`recording.gif\`, \`recording.webm\`, or \`screenshot-*.png\` directly into this GitHub issue editor.`
    : report.videoDurationSeconds > 0
      ? `> 💡 Drag and drop your exported **\`.gif\`**, **\`.webm\`**, or **\`.png\`** screenshot right here to embed it inline on GitHub.`
      : `> 💡 Copy or drag and drop your annotated **\`.png\`** screenshot(s) directly into this GitHub issue editor.`;

  const screenshotSection =
    report.screenshots && report.screenshots.length > 0
      ? `### 📸 Annotated Screenshots (${report.screenshots.length})
${report.screenshots
  .map(
    (s, idx) =>
      `- **Screenshot #${idx + 1}**${s.formattedTime ? ` (\`@${s.formattedTime}\`)` : ''} — \`${s.width}x${s.height}\` ${opts.savedBundlePath ? `(\`${opts.savedBundlePath}/screenshot-${idx + 1}.png\`)` : '*(use "Copy Image" or "Download .png" to paste here)*'}`
  )
  .join('\n')}
`
      : '';

  const redactionBadge =
    totalRedactions > 0
      ? ` · 🔒 \`${totalRedactions} secret(s) auto-redacted\``
      : '';

  return `## 🐛 [BUG] ${report.title || 'Untitled Bug Report'}

**Severity**: ${severityBadges[report.severity]} · **Duration**: \`${Math.floor(report.videoDurationSeconds / 60)}m ${Math.floor(report.videoDurationSeconds % 60)}s\` · **Recorded**: \`${new Date(report.createdAt).toLocaleString()}\`${redactionBadge}

---

### 📝 Summary
${report.description || 'No detailed description provided.'}
${report.rootCauseHint ? `\n**🔍 Root Cause Clue**: ${report.rootCauseHint}\n` : ''}
### 🎥 Session Capture
${attachmentNote}

${screenshotSection}${timelineSection}${curlSection}${playwrightSection}
### 🔁 Steps to Reproduce
${stepsList}

### 🎯 Expected vs 💥 Actual Behavior
- **Expected**: ${report.expectedBehavior || 'Feature should complete without errors.'}
- **Actual**: ${report.actualBehavior || 'Encountered failure shown in the recording and logs.'}

### 🖥️ Environment & Workspace Diagnostics
| Spec | Value |
| :--- | :--- |
| **OS** | \`${report.diagnostics.os}\` |
| **Browser** | \`${report.diagnostics.browser} ${report.diagnostics.browserVersion}\` |
| **Resolution / Viewport** | \`${report.diagnostics.screenResolution}\` / \`${report.diagnostics.viewportSize}\` |
| **CPU Cores** | \`${report.diagnostics.hardwareConcurrency}\` |
${extraDiagRows ? `${extraDiagRows}\n` : ''}| **Timezone** | \`${report.diagnostics.timeZone}\` |

${transcriptSection}${terminalSection}${browserSection}${gitDiffSection}
---
*Generated locally with BugCast Studio — Zero-cloud Screen, Terminal, Proxy & cURL Bug Recorder.*
`;
}

/**
 * Generate a token-optimized, redacted debug prompt ready to paste into Cursor, Claude, Copilot, or Antigravity.
 */
export function generateAiFixPrompt(
  rawReport: BugReport,
  redactOptions: RedactOptions = { redactSecrets: true, redactEmails: false }
): string {
  const { report } = redactBugReport(rawReport, redactOptions);

  const errorLines = (report.terminalLogs || [])
    .filter((l) => l.isError)
    .map((l) => `[${formatOffset(l.offsetSeconds)}] ${l.text}`)
    .slice(-40)
    .join('\n');

  const failedRequests = (report.browserEvents || [])
    .map((ev) => {
      const curl = generateCurlCommand(ev);
      return curl
        ? `${ev.message}\n${curl}${ev.responsePreview ? `\nResponse: ${ev.responsePreview}` : ''}`
        : `[${ev.source}] ${ev.message}`;
    })
    .slice(0, 4)
    .join('\n\n');

  const voiceWalkthrough =
    report.transcript && report.transcript.length > 0
      ? report.transcript.map((t) => `[${t.formattedTime}] ${t.text}`).join('\n')
      : '';

  return `Please help me diagnose and fix the following bug captured locally with BugCast.

# Bug Overview
- Title: ${report.title || 'Runtime Bug'}
- Severity: ${report.severity}
- Project: ${report.diagnostics.projectName || 'workspace'} (Branch: ${report.diagnostics.gitBranch || 'unknown'} @ ${report.diagnostics.gitCommit || 'HEAD'})
- Runtime: ${report.diagnostics.os} | Node ${report.diagnostics.nodeVersion || 'N/A'} | ${report.diagnostics.browser}
- Summary: ${report.description || report.actualBehavior || 'See errors below'}
${report.rootCauseHint ? `- Initial Clue: ${report.rootCauseHint}` : ''}

# Reproduction Steps
${report.stepsToReproduce.length > 0 ? report.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join('\n') : '1. Trigger action shown in error logs'}

${voiceWalkthrough ? `# Spoken Walkthrough\n${voiceWalkthrough}\n\n` : ''}${errorLines || report.consoleLogs.trim() ? `# Terminal / Stack Trace Errors\n\`\`\`\n${errorLines || report.consoleLogs.trim()}\n\`\`\`\n\n` : ''}${failedRequests ? `# Failed Browser / HTTP Requests\n\`\`\`bash\n${failedRequests}\n\`\`\`\n\n` : ''}${report.recentCommits && report.recentCommits.length > 0 ? `# Recent Commits\n${report.recentCommits.join('\n')}\n\n` : ''}${report.gitDiff ? `# Uncommitted Git Diff\n\`\`\`diff\n${report.gitDiff.slice(0, 3500)}\n\`\`\`\n\n` : ''}# Task
1. Identify the exact root cause from the errors, failing HTTP request, and recent diff.
2. Provide the minimal, safe code fix and explain why it happened.`;
}
