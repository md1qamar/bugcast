import React from 'react';
import { Video, History, GitBranch, Cpu, Wifi, WifiOff } from 'lucide-react';
import { WorkspaceContext } from '../types';

interface NavbarProps {
  isRecording: boolean;
  recordingTime: number;
  historyCount: number;
  wsConnected: boolean;
  workspaceContext: WorkspaceContext | null;
  onOpenHistory: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isRecording,
  recordingTime,
  historyCount,
  wsConnected,
  workspaceContext,
  onOpenHistory,
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="border-b border-white/10 bg-dark-900/85 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Video className="w-5 h-5 text-black stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white font-mono">BugCast</span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30">
                STUDIO v2
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Screen + Synced Terminal + Local AI Bug Studio
            </p>
          </div>
        </div>

        {/* Live Telemetry Pills */}
        <div className="flex items-center space-x-2.5">
          {isRecording && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-mono font-bold tracking-wider">
                REC {formatTime(recordingTime)}
              </span>
            </div>
          )}

          {/* Git Branch Pill */}
          {workspaceContext?.git.branch && (
            <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800 border border-white/10 text-xs font-mono text-slate-300">
              <GitBranch className="w-3.5 h-3.5 text-brand-400" />
              <span>{workspaceContext.git.branch}</span>
              {workspaceContext.git.commit && (
                <span className="text-slate-500">@{workspaceContext.git.commit}</span>
              )}
            </div>
          )}

          {/* Local AI Ollama Indicator */}
          {workspaceContext?.ai.ollamaAvailable && (
            <div
              title={`Ollama Local Models: ${workspaceContext.ai.ollamaModels.join(', ')}`}
              className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>Ollama Ready</span>
            </div>
          )}

          {/* CLI Bridge WebSocket Status */}
          <div
            title={
              wsConnected
                ? `Connected to BugCast CLI (${workspaceContext?.cwd || 'localhost'})`
                : 'Browser-only mode (Start via `npm run dev` or `npx bugcast` for live terminal sync)'
            }
            className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
              wsConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{wsConnected ? 'CLI Sync Live' : 'Browser Mode'}</span>
          </div>

          {/* History Button */}
          <button
            onClick={onOpenHistory}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-dark-750 hover:bg-dark-700 border border-white/10 text-slate-300 hover:text-white transition-all text-xs font-medium"
          >
            <History className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Vault</span>
            {historyCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-mono font-bold">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
