import React, { useState } from 'react';
import {
  Cpu,
  Monitor,
  Terminal,
  Layers,
  GitBranch,
  Globe,
  Plus,
  Trash2,
  FileCode,
  AlertCircle,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { BugReport, SystemDiagnostics, WorkspaceContext } from '../types';

interface DiagnosticsPanelProps {
  diagnostics: SystemDiagnostics;
  workspaceContext: WorkspaceContext | null;
  title: string;
  severity: BugReport['severity'];
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  rootCauseHint: string;
  stepsToReproduce: string[];
  consoleLogs: string;
  isAnalyzingAi: boolean;
  aiNotice: string | null;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onRunAiAnalysis: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateSeverity: (severity: BugReport['severity']) => void;
  onUpdateDescription: (desc: string) => void;
  onUpdateExpected: (exp: string) => void;
  onUpdateActual: (act: string) => void;
  onUpdateRootCause: (hint: string) => void;
  onAddStep: (step: string) => void;
  onRemoveStep: (index: number) => void;
  onUpdateLogs: (logs: string) => void;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  diagnostics,
  workspaceContext,
  title,
  severity,
  description,
  expectedBehavior,
  actualBehavior,
  rootCauseHint,
  stepsToReproduce,
  consoleLogs,
  isAnalyzingAi,
  aiNotice,
  selectedModel,
  onSelectModel,
  onRunAiAnalysis,
  onUpdateTitle,
  onUpdateSeverity,
  onUpdateDescription,
  onUpdateExpected,
  onUpdateActual,
  onUpdateRootCause,
  onAddStep,
  onRemoveStep,
  onUpdateLogs,
}) => {
  const [newStep, setNewStep] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'specs' | 'logs'>('info');

  const ollamaModels = workspaceContext?.ai.ollamaModels || [];

  const handleStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStep.trim()) return;
    onAddStep(newStep.trim());
    setNewStep('');
  };

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
      {/* Local AI Auto-Analyze Banner */}
      <div className="p-3.5 bg-gradient-to-r from-purple-950/60 via-dark-800 to-emerald-950/40 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-white">
            {ollamaModels.length > 0 ? 'Local AI Bug Analyzer (Ollama)' : 'Smart Log & Diff Auto-Fill'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {ollamaModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              className="bg-dark-900 border border-white/15 rounded-lg px-2 py-1 text-[11px] font-mono text-purple-300 focus:outline-none"
            >
              {ollamaModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="">Smart Heuristic (Instant)</option>
            </select>
          )}

          <button
            onClick={onRunAiAnalysis}
            disabled={isAnalyzingAi}
            className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-purple-500/20 transition-all"
          >
            {isAnalyzingAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{isAnalyzingAi ? 'Analyzing...' : 'Auto-Fill Issue'}</span>
          </button>
        </div>
      </div>

      {aiNotice && (
        <div className="px-4 py-2 bg-brand-500/10 border-b border-brand-500/20 text-[11px] font-mono text-brand-300">
          {aiNotice}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-dark-900/50 px-4 pt-2.5 gap-2">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'info'
              ? 'border-brand-500 text-brand-400 bg-dark-800/80'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Bug Report</span>
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'specs'
              ? 'border-brand-500 text-brand-400 bg-dark-800/80'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Environment</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 flex items-center space-x-1.5 ${
            activeTab === 'logs'
              ? 'border-brand-500 text-brand-400 bg-dark-800/80'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Extra Notes / Logs</span>
          {consoleLogs.trim() && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 ml-1" />}
        </button>
      </div>

      <div className="p-4">
        {activeTab === 'info' && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <div className="md:col-span-3">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Issue Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onUpdateTitle(e.target.value)}
                  placeholder="e.g. Checkout API returns 500 on empty coupon"
                  className="w-full bg-dark-800 border border-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => onUpdateSeverity(e.target.value as BugReport['severity'])}
                  className="w-full bg-dark-800 border border-white/10 rounded-xl px-2.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🟠 High</option>
                  <option value="critical">🔴 Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Summary</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => onUpdateDescription(e.target.value)}
                placeholder="Briefly describe what happened (or click Auto-Fill Issue above)"
                className="w-full bg-dark-800 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Expected</label>
                <input
                  type="text"
                  value={expectedBehavior}
                  onChange={(e) => onUpdateExpected(e.target.value)}
                  placeholder="Should succeed cleanly"
                  className="w-full bg-dark-800 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Actual</label>
                <input
                  type="text"
                  value={actualBehavior}
                  onChange={(e) => onUpdateActual(e.target.value)}
                  placeholder="Throws unhandled exception"
                  className="w-full bg-dark-800 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {rootCauseHint && (
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200">
                <span className="font-semibold text-purple-300">🔍 Root Cause Clue: </span>
                <input
                  type="text"
                  value={rootCauseHint}
                  onChange={(e) => onUpdateRootCause(e.target.value)}
                  className="w-full bg-transparent text-xs text-purple-100 focus:outline-none mt-1"
                />
              </div>
            )}

            {/* Steps to Reproduce */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Steps to Reproduce
              </label>
              <div className="space-y-1 mb-2 max-h-28 overflow-y-auto">
                {stepsToReproduce.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-dark-800/60 border border-white/5 text-xs text-slate-300"
                  >
                    <span className="font-mono text-brand-400 mr-2">{idx + 1}.</span>
                    <span className="flex-1">{step}</span>
                    <button
                      onClick={() => onRemoveStep(idx)}
                      className="text-slate-500 hover:text-red-400 ml-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleStepSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  placeholder="Add reproduction step..."
                  className="flex-1 bg-dark-800 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={!newStep.trim()}
                  className="px-3 py-1.5 rounded-xl bg-dark-700 hover:bg-dark-600 border border-white/10 text-slate-200 text-xs font-medium flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Step</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5">
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1">
                <Monitor className="w-3 h-3 text-brand-400" />
                <span>OS / Platform</span>
              </div>
              <div className="font-mono text-xs font-semibold text-white truncate">
                {workspaceContext?.runtime.platform || diagnostics.os}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5">
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1">
                <Globe className="w-3 h-3 text-brand-400" />
                <span>Browser</span>
              </div>
              <div className="font-mono text-xs font-semibold text-white truncate">
                {diagnostics.browser} {diagnostics.browserVersion}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5">
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1">
                <Layers className="w-3 h-3 text-brand-400" />
                <span>Screen / Viewport</span>
              </div>
              <div className="font-mono text-xs font-semibold text-white">
                {diagnostics.screenResolution} / {diagnostics.viewportSize}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5">
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1">
                <Cpu className="w-3 h-3 text-brand-400" />
                <span>Node / CPU</span>
              </div>
              <div className="font-mono text-xs font-semibold text-white truncate">
                {diagnostics.nodeVersion || `${diagnostics.hardwareConcurrency} Cores`}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5">
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1">
                <GitBranch className="w-3 h-3 text-brand-400" />
                <span>Git Branch</span>
              </div>
              <div className="font-mono text-xs font-semibold text-white truncate">
                {diagnostics.gitBranch || 'Not detected'} {diagnostics.gitCommit ? `(${diagnostics.gitCommit})` : ''}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-dark-800/80 border border-white/5">
              <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1">
                <FileCode className="w-3 h-3 text-brand-400" />
                <span>Timezone</span>
              </div>
              <div className="font-mono text-xs font-semibold text-white truncate">
                {diagnostics.timeZone}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-400">
              Additional Manual Stack Traces / Notes (Live CLI terminal &amp; browser logs are attached automatically!)
            </label>
            <textarea
              rows={6}
              value={consoleLogs}
              onChange={(e) => onUpdateLogs(e.target.value)}
              placeholder="Paste any extra crash logs or notes you want included in the GitHub issue..."
              className="w-full font-mono text-xs bg-dark-900 border border-white/10 rounded-xl p-3 text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-brand-500 resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
};
