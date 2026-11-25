import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Globe,
  GitBranch,
  Play,
  Square,
  RotateCw,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { BrowserEventEntry, TerminalLogEntry, WorkspaceContext } from '../types';
import { generateCurlCommand } from '../utils/reproGenerator';
import { redactText } from '../utils/secretRedactor';

interface LiveTerminalPanelProps {
  wsConnected: boolean;
  processRunning: boolean;
  activeCommand: string;
  terminalLogs: TerminalLogEntry[];
  browserEvents: BrowserEventEntry[];
  workspaceContext: WorkspaceContext | null;
  proxyStatus: { running: boolean; proxyUrl?: string; targetUrl?: string };
  onStartProxy: (targetUrl: string) => Promise<void>;
  onStopProxy: () => Promise<void>;
  onRunCommand: (command: string) => void;
  onKillCommand: () => void;
  onRestartCommand: () => void;
  onClearLogs: () => void;
}

export const LiveTerminalPanel: React.FC<LiveTerminalPanelProps> = ({
  wsConnected,
  processRunning,
  activeCommand,
  terminalLogs,
  browserEvents,
  workspaceContext,
  proxyStatus,
  onStartProxy,
  onStopProxy,
  onRunCommand,
  onKillCommand,
  onRestartCommand,
  onClearLogs,
}) => {
  const [tab, setTab] = useState<'terminal' | 'browser' | 'git'>('terminal');
  const [commandInput, setCommandInput] = useState('');
  const [proxyTargetInput, setProxyTargetInput] = useState('http://localhost:5173');
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedCurlId, setCopiedCurlId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs.length, browserEvents.length]);

  const errorCount = terminalLogs.filter((l) => l.isError).length;
  const bridgeOrigin =
    typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://127.0.0.1:4173';
  const scriptTagSnippet = `<script src="${bridgeOrigin}/bridge.js"></script>`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onRunCommand(commandInput.trim());
    setCommandInput('');
  };

  const handleProxyToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    setProxyError(null);
    setProxyLoading(true);
    try {
      if (proxyStatus.running) {
        await onStopProxy();
      } else {
        await onStartProxy(proxyTargetInput.trim());
      }
    } catch (err: any) {
      setProxyError(err?.message || 'Proxy action failed');
    } finally {
      setProxyLoading(false);
    }
  };

  const handleCopyBridge = async () => {
    try {
      await navigator.clipboard.writeText(scriptTagSnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleCopyCurl = async (ev: BrowserEventEntry, curl: string) => {
    try {
      await navigator.clipboard.writeText(curl);
      setCopiedCurlId(ev.id);
      setTimeout(() => setCopiedCurlId(null), 1800);
    } catch {
      // Ignore
    }
  };

  const formatOffset = (secs?: number) => {
    if (typeof secs !== 'number') return '--:--';
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
      {/* Tabs Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-dark-900/60 px-4 pt-2.5 gap-2">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setTab('terminal')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 flex items-center space-x-1.5 transition-all ${
              tab === 'terminal'
                ? 'border-brand-500 text-brand-400 bg-dark-800/80'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Live Terminal</span>
            {errorCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 text-[10px] font-mono">
                {errorCount} err
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('browser')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 flex items-center space-x-1.5 transition-all ${
              tab === 'browser'
                ? 'border-brand-500 text-brand-400 bg-dark-800/80'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>App Proxy &amp; Bridge</span>
            {proxyStatus.running && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            {browserEvents.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-mono">
                {browserEvents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('git')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 flex items-center space-x-1.5 transition-all ${
              tab === 'git'
                ? 'border-brand-500 text-brand-400 bg-dark-800/80'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Git Diff</span>
            {workspaceContext?.git.dirtyFiles && workspaceContext.git.dirtyFiles.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono">
                {workspaceContext.git.dirtyFiles.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center space-x-1.5 pb-1.5">
          {processRunning && (
            <button
              onClick={onKillCommand}
              title="Stop active process"
              className="px-2 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-[11px] font-mono flex items-center space-x-1"
            >
              <Square className="w-3 h-3 fill-red-400" />
              <span>Kill</span>
            </button>
          )}
          {!processRunning && activeCommand && (
            <button
              onClick={onRestartCommand}
              title={`Re-run: ${activeCommand}`}
              className="px-2 py-1 rounded-lg bg-dark-750 hover:bg-dark-700 border border-white/10 text-slate-300 text-[11px] font-mono flex items-center space-x-1"
            >
              <RotateCw className="w-3 h-3" />
              <span>Re-run</span>
            </button>
          )}
          <button
            onClick={onClearLogs}
            title="Clear log buffer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab 1: Terminal */}
      {tab === 'terminal' && (
        <div className="p-3 space-y-2.5">
          <div className="h-44 overflow-y-auto rounded-xl bg-[#070a0f] border border-white/5 p-3 font-mono text-[11px] space-y-1">
            {terminalLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-1">
                <span>
                  {wsConnected
                    ? 'CLI connected! Run any command below (e.g. `npm test` or `node app.js`) or launch via `bugcast -- npm run dev`.'
                    : 'Not connected to CLI backend. Launch with `npm run dev` or `npx bugcast` to stream live terminal commands.'}
                </span>
              </div>
            ) : (
              terminalLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start space-x-2 leading-relaxed ${
                    entry.isError
                      ? 'text-red-400 bg-red-500/5 px-1.5 py-0.5 rounded'
                      : entry.stream === 'system'
                        ? 'text-cyan-400'
                        : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-600 select-none shrink-0">
                    [{formatOffset(entry.offsetSeconds)}]
                  </span>
                  <span className="break-all whitespace-pre-wrap">
                    {redactText(entry.text, { redactSecrets: true }).text}
                  </span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 flex items-center bg-dark-900 border border-white/10 rounded-xl px-3">
              <span className="text-brand-400 font-mono text-xs mr-2">$</span>
              <input
                type="text"
                disabled={!wsConnected}
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder={
                  wsConnected
                    ? 'Run a terminal command in workspace (e.g. npm run build, python test.py)...'
                    : 'CLI connection required to run shell commands'
                }
                className="flex-1 bg-transparent py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!wsConnected || !commandInput.trim()}
              className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-black text-xs font-semibold flex items-center space-x-1.5 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Run</span>
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Zero-Edit Proxy + Browser Bridge + Copy cURL */}
      {tab === 'browser' && (
        <div className="p-3.5 space-y-3">
          {/* Zero-Edit Reverse Proxy Launcher */}
          <form
            onSubmit={handleProxyToggle}
            className="p-3 rounded-xl bg-dark-800/80 border border-white/10 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Zero-Edit App Proxy (Auto-captures Console &amp; HTTP cURL)</span>
              </div>
              <button
                type="button"
                onClick={handleCopyBridge}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-mono text-slate-300 flex items-center space-x-1"
                title="Or paste <script> tag manually"
              >
                {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet ? 'Copied' : '<script>'}</span>
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                disabled={!wsConnected || proxyStatus.running}
                value={proxyStatus.running ? proxyStatus.targetUrl || proxyTargetInput : proxyTargetInput}
                onChange={(e) => setProxyTargetInput(e.target.value)}
                placeholder="http://localhost:5173"
                className="flex-1 bg-dark-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!wsConnected || proxyLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  proxyStatus.running
                    ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300'
                    : 'bg-brand-500 hover:bg-brand-600 text-black'
                }`}
              >
                {proxyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{proxyStatus.running ? 'Stop Proxy' : 'Start Proxy'}</span>
              </button>
            </div>

            {proxyStatus.running && proxyStatus.proxyUrl && (
              <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-emerald-300">
                <span>Proxy active — open your app through:</span>
                <a
                  href={proxyStatus.proxyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 underline font-bold text-emerald-400 hover:text-emerald-300"
                >
                  <span>{proxyStatus.proxyUrl}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {proxyError && <p className="text-[11px] font-mono text-red-400">⚠ {proxyError}</p>}
          </form>

          {/* Browser Error & cURL Stream */}
          <div className="h-36 overflow-y-auto rounded-xl bg-[#070a0f] border border-white/5 p-3 font-mono text-[11px] space-y-2">
            {browserEvents.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-center">
                Start the proxy above (or load Chrome Extension) — console errors &amp; failed API calls appear here with 1-click cURL.
              </div>
            ) : (
              browserEvents.map((ev) => {
                const curl = generateCurlCommand(ev);
                return (
                  <div key={ev.id} className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-red-400/90">
                      <span>
                        [{formatOffset(ev.offsetSeconds)}] {ev.source}
                        {typeof ev.status === 'number' ? ` · HTTP ${ev.status}` : ''}
                        {typeof ev.durationMs === 'number' ? ` · ${ev.durationMs}ms` : ''}
                      </span>
                      {curl && (
                        <button
                          onClick={() => handleCopyCurl(ev, curl)}
                          className="px-2 py-0.5 rounded bg-dark-900 border border-white/10 text-emerald-300 hover:text-white flex items-center space-x-1"
                        >
                          {copiedCurlId === ev.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedCurlId === ev.id ? 'Copied cURL' : 'Copy cURL'}</span>
                        </button>
                      )}
                    </div>
                    <div className="break-all">{redactText(ev.message, { redactSecrets: true }).text}</div>
                    {ev.responsePreview && (
                      <div className="text-[10px] text-amber-200/80 bg-black/40 p-1.5 rounded break-all">
                        {redactText(ev.responsePreview.slice(0, 220), { redactSecrets: true }).text}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Git Diff */}
      {tab === 'git' && (
        <div className="p-4 space-y-2.5">
          {!workspaceContext ? (
            <p className="text-xs text-slate-500">Git context is available when running via CLI / dev server.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded-lg bg-dark-800 border border-white/10 text-slate-300">
                  Branch: <strong className="text-brand-400">{workspaceContext.git.branch || 'none'}</strong>
                </span>
                {workspaceContext.git.commit && (
                  <span className="px-2.5 py-1 rounded-lg bg-dark-800 border border-white/10 text-slate-300">
                    Commit: <strong className="text-white">{workspaceContext.git.commit}</strong>
                  </span>
                )}
                {workspaceContext.envKeys && workspaceContext.envKeys.length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-dark-800 border border-white/10 text-slate-400">
                    .env keys: {workspaceContext.envKeys.length} (values masked)
                  </span>
                )}
              </div>

              <div className="h-36 overflow-y-auto rounded-xl bg-[#070a0f] border border-white/5 p-3 font-mono text-[11px] text-emerald-300 whitespace-pre">
                {workspaceContext.git.diff
                  ? redactText(workspaceContext.git.diff, { redactSecrets: true }).text
                  : 'Working tree clean — no uncommitted diff detected.'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
