import {
  AIAnalysisResult,
  BrowserEventEntry,
  BugReport,
  TerminalLogEntry,
  TranscriptSegment,
} from '../types';

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/**
 * Live Web Speech API wrapper for zero-latency local voice transcription during recording.
 */
export class LiveTranscriptController {
  private recognition: SpeechRecognitionInstance | null = null;
  private active = false;
  private startTimeMs = 0;

  static isSupported(): boolean {
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  start(
    startTimeMs: number,
    onSegment: (seg: TranscriptSegment) => void,
    onInterim?: (text: string) => void
  ) {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return false;

    this.startTimeMs = startTimeMs;
    this.active = true;

    const rec: SpeechRecognitionInstance = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript?.trim();
        if (!transcript) continue;

        if (res.isFinal) {
          const elapsed = Math.max(0, Math.floor((Date.now() - this.startTimeMs) / 1000));
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          onSegment({
            id: `tr_${Date.now()}_${i}`,
            timestampSeconds: elapsed,
            formattedTime: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
            text: transcript,
          });
          if (onInterim) onInterim('');
        } else {
          interim += `${transcript} `;
        }
      }
      if (interim && onInterim) onInterim(interim.trim());
    };

    rec.onerror = () => {
      // Avoid crashing recording if speech recognition encounters network/no-speech errors
    };

    rec.onend = () => {
      if (this.active) {
        try {
          rec.start();
        } catch {
          this.active = false;
        }
      }
    };

    try {
      rec.start();
      this.recognition = rec;
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  stop() {
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      // Ignore stop errors
    }
    this.recognition = null;
  }
}

/**
 * Deterministic smart analyzer that parses terminal errors, browser failures,
 * stack traces, git diff, and spoken transcript even when no LLM is running.
 */
export function runSmartHeuristicAnalysis(params: {
  terminalLogs: TerminalLogEntry[];
  browserEvents: BrowserEventEntry[];
  transcript: TranscriptSegment[];
  consoleLogs: string;
  gitDiff?: string;
  dirtyFiles?: string[];
}): AIAnalysisResult {
  const { terminalLogs, browserEvents, transcript, consoleLogs, gitDiff, dirtyFiles } = params;

  const termErrors = terminalLogs.filter((l) => l.isError).map((l) => l.text);
  const manualErrors = consoleLogs
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /(error|exception|failed|500|404|traceback|ts\d+)/i.test(l));
  const browserMsgs = browserEvents.map((b) => b.message);

  const allErrors = [...browserMsgs, ...termErrors, ...manualErrors];
  const primaryError = allErrors[0] || '';

  // Infer severity
  let severity: BugReport['severity'] = 'medium';
  if (/(500|fatal|crash|uncaught|econnrefused|segmentation|unhandled)/i.test(allErrors.join(' '))) {
    severity = 'high';
  }
  if (/(fatal|data loss|panic|out of memory)/i.test(allErrors.join(' '))) {
    severity = 'critical';
  }

  // Extract file/line clue from stack trace
  const fileMatch = allErrors.join('\n').match(/([a-zA-Z0-9_./\\-]+\.(?:ts|tsx|js|jsx|py|go|rs):\d+(?::\d+)?)/);
  const httpMatch = allErrors.join('\n').match(/(?:GET|POST|PUT|DELETE|PATCH)?\s*(https?:\/\/[^\s]+|\/api\/[^\s]+).*?(\b[45]\d{2}\b)/i);

  // Build title
  let title = 'Application error observed during local session';
  if (httpMatch) {
    title = `API ${httpMatch[2]} failure on ${httpMatch[1].replace(/^https?:\/\/[^/]+/, '')}`;
  } else if (primaryError) {
    const clean = primaryError.replace(/^\[.*?\]\s*/, '').slice(0, 72);
    title = clean.length >= 10 ? clean : title;
  } else if (transcript.length > 0) {
    title = transcript[0].text.slice(0, 72);
  }

  // Build steps
  const stepsToReproduce: string[] = [];
  if (dirtyFiles && dirtyFiles.length > 0) {
    stepsToReproduce.push(`Working with modified files: ${dirtyFiles.slice(0, 3).join(', ')}`);
  }
  if (transcript.length > 0) {
    stepsToReproduce.push(`Narration context: "${transcript.map((t) => t.text).join(' ').slice(0, 140)}"`);
  }
  if (httpMatch) {
    stepsToReproduce.push(`Trigger network request to ${httpMatch[1]}`);
  } else {
    stepsToReproduce.push('Run the application and reproduce the recorded UI interaction');
  }
  if (allErrors.length > 0) {
    stepsToReproduce.push(`Observe error in logs: ${primaryError.slice(0, 100)}`);
  }

  const rootCauseParts: string[] = [];
  if (fileMatch) rootCauseParts.push(`Stack trace points to \`${fileMatch[1]}\`.`);
  if (httpMatch) rootCauseParts.push(`Server returned HTTP ${httpMatch[2]} for \`${httpMatch[1]}\`.`);
  if (gitDiff && gitDiff.trim()) rootCauseParts.push('Uncommitted local diff is present in the workspace.');

  const summary = transcript.length > 0
    ? transcript.map((t) => t.text).join(' ')
    : primaryError
      ? `Captured ${allErrors.length} error event(s) during session. First failure: ${primaryError}`
      : 'Captured visual reproduction with system and workspace diagnostics.';

  return {
    title,
    severity,
    summary,
    stepsToReproduce,
    expectedBehavior: 'The operation completes cleanly without uncaught errors or failed requests.',
    actualBehavior: primaryError || 'Unexpected failure occurred as shown in the session recording.',
    rootCauseHint: rootCauseParts.join(' ') || 'Inspect the synced terminal logs and video timeline markers.',
    source: 'heuristic',
  };
}

/**
 * Run local Ollama AI analysis if reachable, otherwise fall back cleanly to smart heuristic extraction.
 */
export async function analyzeBugSession(params: {
  ollamaModel?: string;
  terminalLogs: TerminalLogEntry[];
  browserEvents: BrowserEventEntry[];
  transcript: TranscriptSegment[];
  consoleLogs: string;
  gitDiff?: string;
  dirtyFiles?: string[];
}): Promise<AIAnalysisResult> {
  const { ollamaModel, terminalLogs, browserEvents, transcript, consoleLogs, gitDiff } = params;

  if (ollamaModel) {
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          transcript: transcript.map((t) => `[${t.formattedTime}] ${t.text}`).join('\n'),
          terminalLogs: [
            ...terminalLogs.map((t) => `[${t.stream}] ${t.text}`),
            consoleLogs,
          ].filter(Boolean).join('\n'),
          browserLogs: browserEvents.map((b) => `[${b.source}] ${b.message}`).join('\n'),
          gitDiff: gitDiff || '',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const a = data.analysis || {};
        return {
          title: a.title || 'Bug Report',
          severity: ['low', 'medium', 'high', 'critical'].includes(a.severity) ? a.severity : 'medium',
          summary: a.summary || '',
          stepsToReproduce: Array.isArray(a.stepsToReproduce) ? a.stepsToReproduce : [],
          expectedBehavior: a.expectedBehavior || '',
          actualBehavior: a.actualBehavior || '',
          rootCauseHint: a.rootCauseHint || '',
          source: 'ollama',
          modelName: ollamaModel,
        };
      }
    } catch {
      // Fallback smoothly to deterministic heuristic analyzer
    }
  }

  return runSmartHeuristicAnalysis(params);
}
