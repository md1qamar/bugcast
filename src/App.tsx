import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { RecorderControls } from './components/RecorderControls';
import { VideoPreview } from './components/VideoPreview';
import { EventTagger } from './components/EventTagger';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { LiveTerminalPanel } from './components/LiveTerminalPanel';
import { IssuePreviewModal } from './components/IssuePreviewModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ScreenshotGallery } from './components/ScreenshotGallery';
import { ScreenshotAnnotatorModal } from './components/ScreenshotAnnotatorModal';
import { fetchWorkspaceContext, getSystemDiagnostics } from './utils/diagnostics';
import { createStudioCompositor, StudioCompositorHandle } from './utils/studioCompositor';
import {
  captureSingleScreenFrame,
  snapFrameFromCompositorCanvas,
} from './utils/screenshotUtils';
import {
  analyzeBugSession,
  LiveTranscriptController,
  runSmartHeuristicAnalysis,
} from './utils/aiAnalyzer';
import { generateAiFixPrompt } from './utils/markdownGenerator';
import { saveReport, getAllReports, deleteReport } from './utils/storage';
import {
  BrowserEventEntry,
  BugReport,
  CapturedScreenshot,
  RecordingSettings,
  SystemDiagnostics,
  TerminalLogEntry,
  TimecodedEvent,
  TranscriptSegment,
  WorkspaceContext,
} from './types';
import { Bot, Check, FileText } from 'lucide-react';

export const App: React.FC = () => {
  const speechSupported = LiveTranscriptController.isSupported();

  // Recorder states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasFinishedRecording, setHasFinishedRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Streams & Blobs
  const [compositedStream, setCompositedStream] = useState<MediaStream | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<RecordingSettings>({
    includeMic: true,
    includeWebcam: false,
    liveTranscript: true,
    studioTheme: 'cyber',
    videoQuality: '1080p',
    frameRate: 30,
    recordAudio: true,
  });

  // Workspace, Proxy & WebSocket CLI Bridge state
  const [wsConnected, setWsConnected] = useState(false);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const [processRunning, setProcessRunning] = useState(false);
  const [activeCommand, setActiveCommand] = useState('');
  const [proxyStatus, setProxyStatus] = useState<{ running: boolean; proxyUrl?: string; targetUrl?: string }>({
    running: false,
  });
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogEntry[]>([]);
  const [browserEvents, setBrowserEvents] = useState<BrowserEventEntry[]>([]);

  // Bug Report form state
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics>(getSystemDiagnostics());
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<BugReport['severity']>('medium');
  const [description, setDescription] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [rootCauseHint, setRootCauseHint] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState<string[]>([]);
  const [consoleLogs, setConsoleLogs] = useState('');
  const [events, setEvents] = useState<TimecodedEvent[]>([]);
  const [screenshots, setScreenshots] = useState<CapturedScreenshot[]>([]);
  const [editingScreenshot, setEditingScreenshot] = useState<CapturedScreenshot | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');

  // AI & Quick Copy state
  const [selectedModel, setSelectedModel] = useState('');
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [copiedQuickAi, setCopiedQuickAi] = useState(false);

  // Modals & Drawers
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyReports, setHistoryReports] = useState<BugReport[]>([]);
  const [selectedHistoricalReport, setSelectedHistoricalReport] = useState<BugReport | null>(null);

  // Refs for cleanup & live callbacks
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const compositorRef = useRef<StudioCompositorHandle | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeMediaTracksRef = useRef<MediaStreamTrack[]>([]);
  const transcriptControllerRef = useRef<LiveTranscriptController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const recordingStartMsRef = useRef(0);
  const lastAutoErrorMarkRef = useRef(0);

  const latestStateRef = useRef({
    title,
    severity,
    description,
    expectedBehavior,
    actualBehavior,
    rootCauseHint,
    stepsToReproduce,
    consoleLogs,
    events,
    screenshots,
    terminalLogs,
    browserEvents,
    transcript,
    diagnostics,
    workspaceContext,
    settings,
    recordingTime,
  });

  latestStateRef.current = {
    title,
    severity,
    description,
    expectedBehavior,
    actualBehavior,
    rootCauseHint,
    stepsToReproduce,
    consoleLogs,
    events,
    screenshots,
    terminalLogs,
    browserEvents,
    transcript,
    diagnostics,
    workspaceContext,
    settings,
    recordingTime,
  };

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const refreshHistory = useCallback(async () => {
    try {
      const reports = await getAllReports();
      setHistoryReports(reports);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
    fetchWorkspaceContext().then((ctx) => {
      if (!ctx) return;
      setWorkspaceContext(ctx);
      if (ctx.proxy) setProxyStatus(ctx.proxy);
      if (ctx.ai.ollamaAvailable && ctx.ai.ollamaModels.length > 0) {
        setSelectedModel(ctx.ai.ollamaModels[0]);
      }
      setDiagnostics((prev) => ({
        ...prev,
        gitBranch: ctx.git.branch || prev.gitBranch,
        gitCommit: ctx.git.commit || prev.gitCommit,
        repoUrl: ctx.git.remote || prev.repoUrl,
        nodeVersion: ctx.runtime.nodeVersion,
        pythonVersion: ctx.runtime.pythonVersion,
        projectName: ctx.projectName,
      }));
    });
  }, [refreshHistory]);

  useEffect(() => {
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (msgEvent) => {
        try {
          const msg = JSON.parse(msgEvent.data);
          if (msg.type === 'init') {
            setTerminalLogs(msg.payload.terminalLogs || []);
            setBrowserEvents(msg.payload.browserEvents || []);
            setProcessRunning(Boolean(msg.payload.running));
            setActiveCommand(msg.payload.command || '');
            if (msg.payload.proxy) setProxyStatus(msg.payload.proxy);
          } else if (msg.type === 'terminal:status') {
            setProcessRunning(Boolean(msg.payload.running));
            if (msg.payload.command) setActiveCommand(msg.payload.command);
          } else if (msg.type === 'proxy:status') {
            setProxyStatus(msg.payload || { running: false });
          } else if (msg.type === 'terminal:cleared') {
            setTerminalLogs([]);
            setBrowserEvents([]);
          } else if (msg.type === 'terminal:log') {
            const entry: TerminalLogEntry = msg.payload;
            const offset = isRecordingRef.current
              ? Math.max(0, Math.floor((entry.timestampMs - recordingStartMsRef.current) / 1000))
              : undefined;
            const withOffset = { ...entry, offsetSeconds: offset };
            setTerminalLogs((prev) => [...prev.slice(-400), withOffset]);

            if (isRecordingRef.current && entry.isError && typeof offset === 'number') {
              const now = Date.now();
              if (now - lastAutoErrorMarkRef.current > 2000) {
                lastAutoErrorMarkRef.current = now;
                const mins = Math.floor(offset / 60);
                const secs = offset % 60;
                const fmt = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                setEvents((prev) => [
                  ...prev,
                  {
                    id: `ev_term_${now}`,
                    timestampSeconds: offset,
                    formattedTime: fmt,
                    type: 'terminal-err',
                    title: 'Terminal Error Detected',
                    description: entry.text.slice(0, 120),
                  },
                ]);
                compositorRef.current?.flashMarker(`⚠ Terminal Error @ ${fmt}`);
              }
            }
          } else if (msg.type === 'browser:event') {
            const ev: BrowserEventEntry = msg.payload;
            const offset = isRecordingRef.current
              ? Math.max(0, Math.floor((ev.timestampMs - recordingStartMsRef.current) / 1000))
              : undefined;
            const withOffset = { ...ev, offsetSeconds: offset };
            setBrowserEvents((prev) => [...prev.slice(-300), withOffset]);

            if (isRecordingRef.current && typeof offset === 'number') {
              const now = Date.now();
              if (now - lastAutoErrorMarkRef.current > 1500) {
                lastAutoErrorMarkRef.current = now;
                const mins = Math.floor(offset / 60);
                const secs = offset % 60;
                const fmt = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                setEvents((prev) => [
                  ...prev,
                  {
                    id: `ev_br_${now}`,
                    timestampSeconds: offset,
                    formattedTime: fmt,
                    type: 'browser-err',
                    title: ev.status ? `HTTP ${ev.status} Error` : `Browser ${ev.source}`,
                    description: ev.message.slice(0, 120),
                  },
                ]);
                compositorRef.current?.flashMarker(`🌐 App Error @ ${fmt}`);
              }
            }
          }
        } catch {
          // Ignore invalid JSON frames
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording, isPaused]);

  const handleUpdateSettings = (partial: Partial<RecordingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (partial.studioTheme && compositorRef.current) {
        compositorRef.current.updateTheme(partial.studioTheme);
      }
      return next;
    });
  };

  const handleStartProxy = async (targetUrl: string) => {
    const res = await fetch('/api/proxy/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start proxy');
    setProxyStatus(data);
  };

  const handleStopProxy = async () => {
    await fetch('/api/proxy/stop', { method: 'POST' });
    setProxyStatus({ running: false });
  };

  const startRecording = async () => {
    try {
      recordedChunksRef.current = [];
      activeMediaTracksRef.current = [];
      setRecordingTime(0);
      setEvents([]);
      setTranscript([]);
      setInterimTranscript('');
      setAiNotice(null);

      const width = settings.videoQuality === '1080p' ? 1920 : 1280;
      const height = settings.videoQuality === '1080p' ? 1080 : 720;

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: settings.frameRate, width, height },
        audio: settings.recordAudio,
      });
      activeMediaTracksRef.current.push(...displayStream.getTracks());

      let camStream: MediaStream | null = null;
      if (settings.includeWebcam) {
        try {
          camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 360 },
          });
          activeMediaTracksRef.current.push(...camStream.getTracks());
        } catch (camErr) {
          console.warn('Webcam denied or unavailable:', camErr);
        }
      }

      const windowLabel = workspaceContext?.git.branch
        ? `${workspaceContext.projectName} (${workspaceContext.git.branch})`
        : workspaceContext?.projectName || 'BugCast Studio';

      const compositor = createStudioCompositor({
        screenStream: displayStream,
        webcamStream: camStream,
        theme: settings.studioTheme,
        width,
        height,
        fps: settings.frameRate,
        windowLabel,
      });
      compositorRef.current = compositor;
      setCompositedStream(compositor.stream);

      const combinedTracks: MediaStreamTrack[] = [...compositor.stream.getVideoTracks()];
      if (settings.includeMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          activeMediaTracksRef.current.push(...micStream.getTracks());

          const audioCtx = new AudioContext();
          audioContextRef.current = audioCtx;
          const dest = audioCtx.createMediaStreamDestination();

          if (displayStream.getAudioTracks().length > 0) {
            audioCtx.createMediaStreamSource(displayStream).connect(dest);
          }
          audioCtx.createMediaStreamSource(micStream).connect(dest);
          combinedTracks.push(...dest.stream.getAudioTracks());
        } catch (micErr) {
          console.warn('Mic access denied:', micErr);
          if (displayStream.getAudioTracks().length > 0) {
            combinedTracks.push(...displayStream.getAudioTracks());
          }
        }
      } else if (displayStream.getAudioTracks().length > 0) {
        combinedTracks.push(...displayStream.getAudioTracks());
      }

      const finalStream = new MediaStream(combinedTracks);
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond: settings.videoQuality === '1080p' ? 4_500_000 : 2_500_000,
      });
      mediaRecorderRef.current = recorder;

      const startMs = Date.now();
      recordingStartMsRef.current = startMs;

      if (settings.includeMic && settings.liveTranscript && speechSupported) {
        const recController = new LiveTranscriptController();
        recController.start(
          startMs,
          (seg) => setTranscript((prev) => [...prev, seg]),
          (interim) => setInterimTranscript(interim)
        );
        transcriptControllerRef.current = recController;
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        transcriptControllerRef.current?.stop();
        transcriptControllerRef.current = null;
        setInterimTranscript('');

        compositorRef.current?.destroy();
        compositorRef.current = null;
        setCompositedStream(null);

        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        activeMediaTracksRef.current.forEach((t) => t.stop());
        activeMediaTracksRef.current = [];

        const fullBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        const videoUrl = URL.createObjectURL(fullBlob);
        setRecordedVideoBlob(fullBlob);
        setRecordedVideoUrl(videoUrl);
        setHasFinishedRecording(true);
        setIsRecording(false);
        setIsPaused(false);

        const snap = latestStateRef.current;

        let finalTitle = snap.title.trim();
        let finalSeverity = snap.severity;
        let finalDesc = snap.description;
        let finalSteps = snap.stepsToReproduce;
        let finalExpected = snap.expectedBehavior;
        let finalActual = snap.actualBehavior;
        let finalRootCause = snap.rootCauseHint;

        if (!finalTitle) {
          const heuristic = runSmartHeuristicAnalysis({
            terminalLogs: snap.terminalLogs,
            browserEvents: snap.browserEvents,
            transcript: snap.transcript,
            consoleLogs: snap.consoleLogs,
            gitDiff: snap.workspaceContext?.git.diff,
            dirtyFiles: snap.workspaceContext?.git.dirtyFiles,
          });
          finalTitle = heuristic.title;
          finalSeverity = heuristic.severity;
          finalDesc = finalDesc || heuristic.summary;
          if (finalSteps.length === 0) finalSteps = heuristic.stepsToReproduce;
          finalExpected = finalExpected || heuristic.expectedBehavior;
          finalActual = finalActual || heuristic.actualBehavior;
          finalRootCause = finalRootCause || heuristic.rootCauseHint;

          setTitle(finalTitle);
          setSeverity(finalSeverity);
          setDescription(finalDesc);
          setStepsToReproduce(finalSteps);
          setExpectedBehavior(finalExpected);
          setActualBehavior(finalActual);
          setRootCauseHint(finalRootCause);
          setAiNotice('⚡ Auto-extracted summary & clues from session logs/transcript.');
        }

        const newReport: BugReport = {
          id: `rep_${Date.now()}`,
          title: finalTitle || `Bug Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          severity: finalSeverity,
          description: finalDesc,
          stepsToReproduce: finalSteps,
          expectedBehavior: finalExpected,
          actualBehavior: finalActual,
          rootCauseHint: finalRootCause,
          diagnostics: snap.diagnostics,
          events: snap.events,
          screenshots: snap.screenshots,
          terminalLogs: snap.terminalLogs,
          browserEvents: snap.browserEvents,
          transcript: snap.transcript,
          consoleLogs: snap.consoleLogs,
          gitDiff: snap.workspaceContext?.git.diff,
          dirtyFiles: snap.workspaceContext?.git.dirtyFiles,
          recentCommits: snap.workspaceContext?.git.recentCommits,
          envKeys: snap.workspaceContext?.envKeys,
          studioTheme: snap.settings.studioTheme,
          videoBlobUrl: videoUrl,
          videoDurationSeconds: Math.max(1, snap.recordingTime),
          createdAt: new Date().toISOString(),
        };

        saveReport(newReport, fullBlob).then(() => {
          refreshHistory();
        });
      };

      displayStream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      recorder.start(500);
      setIsRecording(true);
      setHasFinishedRecording(false);
    } catch (err) {
      console.error('Failed to start recording:', err);
      compositorRef.current?.destroy();
      activeMediaTracksRef.current.forEach((t) => t.stop());
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const handleReset = () => {
    setHasFinishedRecording(false);
    setRecordedVideoUrl(null);
    setRecordedVideoBlob(null);
    setRecordingTime(0);
    setEvents([]);
    setScreenshots([]);
    setTranscript([]);
    setAiNotice(null);
  };

  const handleCaptureStandaloneScreenshot = async () => {
    try {
      const windowLabel = workspaceContext?.git.branch
        ? `${workspaceContext.projectName} (${workspaceContext.git.branch})`
        : workspaceContext?.projectName || 'BugCast Screenshot';

      const captured = await captureSingleScreenFrame(settings.studioTheme, windowLabel);
      const newShot: CapturedScreenshot = {
        id: `shot_${Date.now()}`,
        dataUrl: captured.dataUrl,
        rawDataUrl: captured.rawDataUrl,
        width: captured.width,
        height: captured.height,
        theme: settings.studioTheme,
        windowLabel,
        crop: null,
        scalePercent: 100,
        annotations: [],
        createdAt: new Date().toISOString(),
      };
      setEditingScreenshot(newShot);
    } catch (err) {
      console.warn('Screenshot capture canceled or failed:', err);
    }
  };

  const handleSnapRecordingFrame = () => {
    if (!compositorRef.current) return;
    const snap = snapFrameFromCompositorCanvas(compositorRef.current.canvas);
    const mins = Math.floor(recordingTime / 60);
    const secs = recordingTime % 60;
    const fmt = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const newShot: CapturedScreenshot = {
      id: `shot_${Date.now()}`,
      dataUrl: snap.dataUrl,
      rawDataUrl: snap.rawDataUrl,
      width: snap.width,
      height: snap.height,
      theme: 'raw',
      crop: null,
      scalePercent: 100,
      annotations: [],
      timestampSeconds: recordingTime,
      formattedTime: fmt,
      createdAt: new Date().toISOString(),
    };
    setScreenshots((prev) => [...prev, newShot]);
    setEvents((prev) => [
      ...prev,
      {
        id: `ev_shot_${Date.now()}`,
        timestampSeconds: recordingTime,
        formattedTime: fmt,
        type: 'screenshot',
        title: 'Screenshot Captured',
      },
    ]);
    compositorRef.current.flashMarker(`📸 Screenshot Saved @ ${fmt}`);
  };

  const handleSaveAnnotatedScreenshot = (updated: CapturedScreenshot) => {
    setScreenshots((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      const next = exists ? prev.map((s) => (s.id === updated.id ? updated : s)) : [...prev, updated];

      // Persist standalone screenshot-only session to local IndexedDB Vault when not currently recording
      if (!isRecording && !hasFinishedRecording) {
        const shotReport: BugReport = {
          ...currentReport,
          id: `rep_${Date.now()}`,
          title: title.trim() || 'Screenshot Bug Report',
          screenshots: next,
          videoDurationSeconds: 0,
          createdAt: new Date().toISOString(),
        };
        saveReport(shotReport).then(() => refreshHistory());
      }
      return next;
    });
  };

  const handleRunAiAnalysis = async () => {
    setIsAnalyzingAi(true);
    setAiNotice(null);
    try {
      const result = await analyzeBugSession({
        ollamaModel: selectedModel || undefined,
        terminalLogs,
        browserEvents,
        transcript,
        consoleLogs,
        gitDiff: workspaceContext?.git.diff,
        dirtyFiles: workspaceContext?.git.dirtyFiles,
      });

      setTitle(result.title);
      setSeverity(result.severity);
      setDescription(result.summary);
      if (result.stepsToReproduce.length > 0) {
        setStepsToReproduce(result.stepsToReproduce);
      }
      setExpectedBehavior(result.expectedBehavior);
      setActualBehavior(result.actualBehavior);
      setRootCauseHint(result.rootCauseHint);
      setAiNotice(
        result.source === 'ollama'
          ? `✨ Analyzed locally via Ollama (${result.modelName})`
          : '⚡ Auto-extracted via Smart Log & Diff Analyzer'
      );
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const handleAddEvent = (eventData: Omit<TimecodedEvent, 'id'>) => {
    const newEvent: TimecodedEvent = {
      ...eventData,
      id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setEvents((prev) => [...prev, newEvent]);
    compositorRef.current?.flashMarker(`🏷 ${eventData.title} @ ${eventData.formattedTime}`);
  };

  const handleRemoveEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const handleDeleteReport = async (id: string) => {
    await deleteReport(id);
    refreshHistory();
  };

  const sendWs = (payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const currentReport: BugReport = {
    id: `rep_${Date.now()}`,
    title: title.trim() || 'Bug Session',
    severity,
    description,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    rootCauseHint,
    diagnostics,
    events,
    screenshots,
    terminalLogs,
    browserEvents,
    transcript,
    consoleLogs,
    gitDiff: workspaceContext?.git.diff,
    dirtyFiles: workspaceContext?.git.dirtyFiles,
    recentCommits: workspaceContext?.git.recentCommits,
    envKeys: workspaceContext?.envKeys,
    studioTheme: settings.studioTheme,
    videoBlobUrl: recordedVideoUrl || undefined,
    videoDurationSeconds: recordingTime,
    createdAt: new Date().toISOString(),
  };

  const handleQuickCopyAiPrompt = async () => {
    try {
      const prompt = generateAiFixPrompt(currentReport, { redactSecrets: true, redactEmails: false });
      await navigator.clipboard.writeText(prompt);
      setCopiedQuickAi(true);
      setTimeout(() => setCopiedQuickAi(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-dark-900 text-slate-100">
      <Navbar
        isRecording={isRecording}
        recordingTime={recordingTime}
        historyCount={historyReports.length}
        wsConnected={wsConnected}
        workspaceContext={workspaceContext}
        onOpenHistory={() => setShowHistory(true)}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <RecorderControls
          isRecording={isRecording}
          isPaused={isPaused}
          hasFinishedRecording={hasFinishedRecording}
          settings={settings}
          speechSupported={speechSupported}
          onUpdateSettings={handleUpdateSettings}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onPauseRecording={pauseRecording}
          onResumeRecording={resumeRecording}
          onReset={handleReset}
          onCaptureScreenshot={handleCaptureStandaloneScreenshot}
          onSnapRecordingFrame={handleSnapRecordingFrame}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-5">
            <VideoPreview
              isRecording={isRecording}
              hasFinishedRecording={hasFinishedRecording}
              compositedStream={compositedStream}
              recordedVideoUrl={recordedVideoUrl}
              recordingTime={recordingTime}
              events={events}
              terminalLogs={terminalLogs}
              browserEvents={browserEvents}
              transcript={transcript}
            />

            <ScreenshotGallery
              screenshots={screenshots}
              onEdit={(shot) => setEditingScreenshot(shot)}
              onRemove={(id) => setScreenshots((prev) => prev.filter((s) => s.id !== id))}
            />

            <LiveTerminalPanel
              wsConnected={wsConnected}
              processRunning={processRunning}
              activeCommand={activeCommand}
              terminalLogs={terminalLogs}
              browserEvents={browserEvents}
              workspaceContext={workspaceContext}
              proxyStatus={proxyStatus}
              onStartProxy={handleStartProxy}
              onStopProxy={handleStopProxy}
              onRunCommand={(command) => sendWs({ type: 'terminal:run', command })}
              onKillCommand={() => sendWs({ type: 'terminal:kill' })}
              onRestartCommand={() => sendWs({ type: 'terminal:restart' })}
              onClearLogs={() => sendWs({ type: 'terminal:clear' })}
            />

            <EventTagger
              isRecording={isRecording}
              recordingTime={recordingTime}
              events={events}
              transcript={transcript}
              interimTranscript={interimTranscript}
              onAddEvent={handleAddEvent}
              onRemoveEvent={handleRemoveEvent}
            />
          </div>

          {/* Right Column */}
          <div className="lg:col-span-5 space-y-4">
            <DiagnosticsPanel
              diagnostics={diagnostics}
              workspaceContext={workspaceContext}
              title={title}
              severity={severity}
              description={description}
              expectedBehavior={expectedBehavior}
              actualBehavior={actualBehavior}
              rootCauseHint={rootCauseHint}
              stepsToReproduce={stepsToReproduce}
              consoleLogs={consoleLogs}
              isAnalyzingAi={isAnalyzingAi}
              aiNotice={aiNotice}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              onRunAiAnalysis={handleRunAiAnalysis}
              onUpdateTitle={setTitle}
              onUpdateSeverity={setSeverity}
              onUpdateDescription={setDescription}
              onUpdateExpected={setExpectedBehavior}
              onUpdateActual={setActualBehavior}
              onUpdateRootCause={setRootCauseHint}
              onAddStep={(s) => setStepsToReproduce((prev) => [...prev, s])}
              onRemoveStep={(i) => setStepsToReproduce((prev) => prev.filter((_, idx) => idx !== i))}
              onUpdateLogs={setConsoleLogs}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={handleQuickCopyAiPrompt}
                className="py-3 px-4 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 font-semibold text-xs flex items-center justify-center space-x-2 transition-all"
              >
                {copiedQuickAi ? <Check className="w-4 h-4 text-emerald-400" /> : <Bot className="w-4 h-4" />}
                <span>{copiedQuickAi ? 'AI Prompt Copied!' : 'Copy AI Fix Prompt'}</span>
              </button>

              <button
                onClick={() => setShowIssueModal(true)}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-black font-bold text-xs shadow-xl shadow-brand-500/20 flex items-center justify-center space-x-2 transition-all"
              >
                <FileText className="w-4 h-4" />
                <span>
                  {hasFinishedRecording
                    ? 'Export Issue / GIF / .html'
                    : 'Export & Redact Preview'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-5 bg-dark-950/60 mt-10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-mono font-bold text-slate-300">BugCast Studio v2</span>
            <span>— Auto-Redacted Screen, Proxy, Terminal Sync &amp; cURL Bug Studio.</span>
          </div>
          <div className="flex items-center space-x-4">
            <span>Auto Secret Redaction</span>
            <span>•</span>
            <span>Offline .html Replay</span>
            <span>•</span>
            <span>MIT License</span>
          </div>
        </div>
      </footer>

      {showIssueModal && (
        <IssuePreviewModal
          report={selectedHistoricalReport || currentReport}
          videoBlob={selectedHistoricalReport ? null : recordedVideoBlob}
          wsConnected={wsConnected}
          ghCliAvailable={Boolean(workspaceContext?.runtime.ghCliAvailable)}
          onEditScreenshot={(shot) => {
            setShowIssueModal(false);
            setEditingScreenshot(shot);
          }}
          onClose={() => {
            setShowIssueModal(false);
            setSelectedHistoricalReport(null);
          }}
        />
      )}

      <HistoryDrawer
        isOpen={showHistory}
        reports={historyReports}
        onClose={() => setShowHistory(false)}
        onSelectReport={(report) => {
          setSelectedHistoricalReport(report);
          setShowHistory(false);
          setShowIssueModal(true);
        }}
        onDeleteReport={handleDeleteReport}
      />

      {editingScreenshot && (
        <ScreenshotAnnotatorModal
          screenshot={editingScreenshot}
          onSave={handleSaveAnnotatedScreenshot}
          onClose={() => setEditingScreenshot(null)}
        />
      )}
    </div>
  );
};

export default App;
