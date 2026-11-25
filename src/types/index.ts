export type StudioTheme = 'cyber' | 'midnight' | 'sunset' | 'raw';

export interface SystemDiagnostics {
  os: string;
  browser: string;
  browserVersion: string;
  userAgent: string;
  screenResolution: string;
  devicePixelRatio: number;
  viewportSize: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  language: string;
  timeZone: string;
  gitBranch?: string;
  gitCommit?: string;
  repoUrl?: string;
  nodeVersion?: string;
  pythonVersion?: string;
  projectName?: string;
}

export interface WorkspaceContext {
  cwd: string;
  projectName: string;
  projectVersion: string;
  frameworks: string[];
  envKeys?: string[];
  git: {
    branch?: string;
    commit?: string;
    remote?: string;
    recentCommits?: string[];
    dirtyFiles: string[];
    diffStat?: string;
    diff?: string;
  };
  runtime: {
    nodeVersion: string;
    pythonVersion?: string;
    platform: string;
    cpuModel: string;
    cpuCores: number;
    totalMemoryGb: number;
    ghCliAvailable: boolean;
  };
  ai: {
    ollamaAvailable: boolean;
    ollamaModels: string[];
  };
  proxy?: {
    running: boolean;
    proxyUrl?: string;
    targetUrl?: string;
  };
}

export interface TerminalLogEntry {
  id: string;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  timestampMs: number;
  offsetSeconds?: number;
  isError: boolean;
}

export interface BrowserEventEntry {
  id: string;
  level: 'error' | 'warn' | 'info';
  source: string;
  message: string;
  url?: string;
  status?: number;
  method?: string;
  requestUrl?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responsePreview?: string;
  durationMs?: number;
  timestampMs: number;
  offsetSeconds?: number;
}

export interface TranscriptSegment {
  id: string;
  timestampSeconds: number;
  formattedTime: string;
  text: string;
}

export interface TimecodedEvent {
  id: string;
  timestampSeconds: number;
  formattedTime: string;
  type: 'bug' | 'api-fail' | 'ui-glitch' | 'note' | 'terminal-err' | 'browser-err' | 'screenshot' | 'custom';
  title: string;
  description?: string;
}

export interface ScreenshotCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AnnotationLayer =
  | {
      id: string;
      type: 'arrow';
      color: string;
      strokeWidth: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      id: string;
      type: 'box';
      color: string;
      strokeWidth: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      id: string;
      type: 'blur';
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      id: string;
      type: 'pen';
      color: string;
      strokeWidth: number;
      points: { x: number; y: number }[];
    }
  | {
      id: string;
      type: 'text';
      color: string;
      fontSize: number;
      x: number;
      y: number;
      maxWidth: number;
      text: string;
    }
  | {
      id: string;
      type: 'image';
      dataUrl: string;
      x: number;
      y: number;
      w: number;
      h: number;
    };

export interface CapturedScreenshot {
  id: string;
  dataUrl: string;
  rawDataUrl?: string;
  width: number;
  height: number;
  theme?: StudioTheme;
  windowLabel?: string;
  crop?: ScreenshotCrop | null;
  scalePercent?: 100 | 75 | 50;
  annotations?: AnnotationLayer[];
  timestampSeconds?: number;
  formattedTime?: string;
  label?: string;
  createdAt: string;
}

export interface BugReport {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  rootCauseHint?: string;
  diagnostics: SystemDiagnostics;
  events: TimecodedEvent[];
  screenshots: CapturedScreenshot[];
  terminalLogs: TerminalLogEntry[];
  browserEvents: BrowserEventEntry[];
  transcript: TranscriptSegment[];
  consoleLogs: string;
  gitDiff?: string;
  dirtyFiles?: string[];
  recentCommits?: string[];
  envKeys?: string[];
  studioTheme: StudioTheme;
  videoBlobUrl?: string;
  videoDurationSeconds: number;
  createdAt: string;
  fileSizeFormatted?: string;
}

export interface RecordingSettings {
  includeMic: boolean;
  includeWebcam: boolean;
  liveTranscript: boolean;
  studioTheme: StudioTheme;
  videoQuality: '720p' | '1080p';
  frameRate: 30 | 60;
  recordAudio: boolean;
}

export interface AIAnalysisResult {
  title: string;
  severity: BugReport['severity'];
  summary: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  rootCauseHint: string;
  source: 'ollama' | 'heuristic';
  modelName?: string;
}
