import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  FileText,
  Video,
  Film,
  HardDrive,
  Send,
  Loader2,
  ShieldCheck,
  Bot,
  FileCode2,
  Camera,
  Pencil,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BugReport, CapturedScreenshot } from '../types';
import { generateAiFixPrompt, generateGitHubIssueMarkdown } from '../utils/markdownGenerator';
import { exportVideoToGif } from '../utils/gifExporter';
import { redactBugReport } from '../utils/secretRedactor';
import { generateInteractiveHtmlBundle } from '../utils/htmlBundleExporter';
import { copyPngToClipboard } from '../utils/screenshotUtils';

interface IssuePreviewModalProps {
  report: BugReport;
  videoBlob: Blob | null;
  wsConnected: boolean;
  ghCliAvailable: boolean;
  onEditScreenshot?: (shot: CapturedScreenshot) => void;
  onClose: () => void;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const IssuePreviewModal: React.FC<IssuePreviewModalProps> = ({
  report,
  videoBlob,
  wsConnected,
  ghCliAvailable,
  onEditScreenshot,
  onClose,
}) => {
  const [copiedType, setCopiedType] = useState<'issue' | 'ai' | null>(null);
  const [copiedShotId, setCopiedShotId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'markdown' | 'ai' | 'preview'>('markdown');
  const [redactSecrets, setRedactSecrets] = useState(true);
  const [redactEmails, setRedactEmails] = useState(false);

  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [gifResult, setGifResult] = useState<{ blob: Blob; url: string; sizeKb: number } | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [savingBundle, setSavingBundle] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [ghUrl, setGhUrl] = useState<string | null>(null);
  const [creatingGh, setCreatingGh] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const redactOptions = { redactSecrets, redactEmails };
  const redactionSummary = redactBugReport(report, redactOptions);
  const markdownContent = generateGitHubIssueMarkdown(report, {
    savedBundlePath: savedPath || undefined,
    redactOptions,
  });
  const aiPromptContent = generateAiFixPrompt(report, redactOptions);

  const resolveSourceVideoBlob = async (): Promise<Blob | null> => {
    if (videoBlob) return videoBlob;
    if (report.videoBlobUrl) {
      const resp = await fetch(report.videoBlobUrl);
      return await resp.blob();
    }
    return null;
  };

  const handleCopyText = async (type: 'issue' | 'ai') => {
    try {
      await navigator.clipboard.writeText(type === 'issue' ? markdownContent : aiPromptContent);
      setCopiedType(type);
      confetti({
        particleCount: 55,
        spread: 65,
        origin: { y: 0.7 },
      });
      setTimeout(() => setCopiedType(null), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleDownloadVideo = () => {
    if (!videoBlob && !report.videoBlobUrl) return;
    const url = report.videoBlobUrl || (videoBlob ? URL.createObjectURL(videoBlob) : '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `bugcast-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportGif = async () => {
    setActionError(null);
    const sourceBlob = await resolveSourceVideoBlob();
    if (!sourceBlob) {
      setActionError('No video recording available to convert to GIF.');
      return;
    }

    try {
      setGifProgress(1);
      const res = await exportVideoToGif(sourceBlob, report.videoDurationSeconds || 5, {
        targetWidth: 720,
        fps: 10,
        maxDurationSec: 25,
        onProgress: (p) => setGifProgress(p),
      });
      setGifResult({
        blob: res.gifBlob,
        url: res.gifUrl,
        sizeKb: Math.round(res.sizeBytes / 1024),
      });
      setGifProgress(null);
    } catch (err: any) {
      setGifProgress(null);
      setActionError(err?.message || 'GIF encoding failed');
    }
  };

  const handleDownloadGif = () => {
    if (!gifResult) return;
    const a = document.createElement('a');
    a.href = gifResult.url;
    a.download = `bugcast-${Date.now()}.gif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportHtmlBundle = async () => {
    setActionError(null);
    setExportingHtml(true);
    try {
      const sourceBlob = await resolveSourceVideoBlob();
      const videoDataUrl = sourceBlob ? await blobToDataUrl(sourceBlob) : undefined;
      const htmlString = generateInteractiveHtmlBundle(report, videoDataUrl, redactOptions);
      const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bugcast-replay-${report.title ? report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) : 'session'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionError(err?.message || 'Could not export interactive HTML bundle');
    } finally {
      setExportingHtml(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ISSUE-${report.title ? report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'bug'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveBundleToDisk = async () => {
    setActionError(null);
    setSavingBundle(true);
    try {
      const sourceBlob = await resolveSourceVideoBlob();
      const videoBase64 = sourceBlob ? await blobToDataUrl(sourceBlob) : undefined;
      const gifBase64 = gifResult ? await blobToDataUrl(gifResult.blob) : undefined;
      const htmlBundle = generateInteractiveHtmlBundle(report, videoBase64, redactOptions);

      const res = await fetch('/api/save-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: report.id,
          markdown: markdownContent,
          htmlBundle,
          reportJson: redactionSummary.report,
          videoBase64,
          gifBase64,
          screenshots: report.screenshots || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save bundle');
      setSavedPath(data.relativePath || data.bundlePath);
    } catch (err: any) {
      setActionError(err?.message || 'Could not save session bundle');
    } finally {
      setSavingBundle(false);
    }
  };

  const handleCreateGhIssue = async () => {
    setActionError(null);
    setCreatingGh(true);
    try {
      const res = await fetch('/api/create-gh-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[BUG] ${redactionSummary.report.title || 'Bug Session'}`,
          markdown: markdownContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'gh CLI failed');
      setGhUrl(data.issueUrl);
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.7 } });
    } catch (err: any) {
      setActionError(err?.message || 'GitHub CLI issue creation failed');
    } finally {
      setCreatingGh(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl max-h-[92vh] glass-panel bg-dark-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-white/10 bg-dark-800/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Export Issue, AI Prompt &amp; Offline Replay</h3>
              <p className="text-xs text-slate-400">
                Auto-redacted secrets, cURL repros, Playwright stub, GIF &amp; portable HTML
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex bg-dark-750 p-1 rounded-xl border border-white/10 text-xs mr-2">
              <button
                onClick={() => setViewMode('markdown')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  viewMode === 'markdown' ? 'bg-brand-500 text-black font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                GitHub .md
              </button>
              <button
                onClick={() => setViewMode('ai')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  viewMode === 'ai' ? 'bg-purple-500 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                AI Fix Prompt
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  viewMode === 'preview' ? 'bg-brand-500 text-black font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Summary + GIF
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Auto-Redaction Safety Strip */}
        <div className="px-6 py-2.5 bg-dark-950/70 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <ShieldCheck
              className={`w-4 h-4 ${redactSecrets ? 'text-emerald-400' : 'text-amber-400'}`}
            />
            <span className="font-mono text-slate-200">
              {redactSecrets
                ? redactionSummary.totalRedactions > 0
                  ? `🔒 ${redactionSummary.totalRedactions} secret(s) auto-redacted (${redactionSummary.categories.join(', ')})`
                  : '🔒 Secret Redaction Active (0 leaks detected)'
                : '⚠ Secret Redaction Disabled'}
            </span>
          </div>

          <div className="flex items-center space-x-4 text-[11px] text-slate-300">
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={redactSecrets}
                onChange={(e) => setRedactSecrets(e.target.checked)}
                className="accent-brand-500"
              />
              <span>Redact API Keys / JWT / DB URLs</span>
            </label>
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={redactEmails}
                onChange={(e) => setRedactEmails(e.target.checked)}
                className="accent-brand-500"
              />
              <span>Redact Emails</span>
            </label>
          </div>
        </div>

        {/* Status Banners */}
        {actionError && (
          <div className="px-6 py-2 bg-red-500/15 border-b border-red-500/30 text-xs text-red-300 font-mono">
            ⚠ {actionError}
          </div>
        )}
        {savedPath && (
          <div className="px-6 py-2 bg-emerald-500/15 border-b border-emerald-500/30 text-xs text-emerald-300 font-mono">
            ✔ Saved complete bundle (ISSUE.md + bug-report.html + media) to: {savedPath}
          </div>
        )}
        {ghUrl && (
          <div className="px-6 py-2 bg-purple-500/15 border-b border-purple-500/30 text-xs text-purple-200 font-mono flex items-center justify-between">
            <span>🚀 GitHub Issue created!</span>
            <a href={ghUrl} target="_blank" rel="noreferrer" className="underline font-bold">
              {ghUrl}
            </a>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 font-mono text-xs space-y-4">
          {gifProgress !== null && (
            <div className="p-4 rounded-xl bg-dark-800 border border-brand-500/30 space-y-2">
              <div className="flex justify-between text-xs text-brand-300">
                <span>Encoding crisp GitHub GIF in browser...</span>
                <span>{gifProgress}%</span>
              </div>
              <div className="h-2 bg-dark-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all duration-150"
                  style={{ width: `${gifProgress}%` }}
                />
              </div>
            </div>
          )}

          {gifResult && viewMode === 'preview' && (
            <div className="p-3 rounded-xl bg-dark-800 border border-brand-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-400">
                  Generated GIF Preview ({gifResult.sizeKb} KB)
                </span>
                <button
                  onClick={handleDownloadGif}
                  className="px-2.5 py-1 rounded-lg bg-brand-500 text-black text-xs font-bold flex items-center space-x-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Save .gif</span>
                </button>
              </div>
              <img src={gifResult.url} alt="Exported GIF" className="w-full rounded-lg border border-white/10" />
            </div>
          )}

          {viewMode === 'markdown' && (
            <pre className="whitespace-pre-wrap text-emerald-400 bg-dark-950 p-4 rounded-xl border border-white/5 selection:bg-brand-500 selection:text-black">
              {markdownContent}
            </pre>
          )}

          {viewMode === 'ai' && (
            <pre className="whitespace-pre-wrap text-purple-300 bg-dark-950 p-4 rounded-xl border border-purple-500/20 selection:bg-purple-500 selection:text-white">
              {aiPromptContent}
            </pre>
          )}

          {viewMode === 'preview' && (
            <div className="space-y-4 text-slate-200 font-sans text-sm">
              <div className="p-4 rounded-xl bg-dark-800/60 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-white">
                    {redactionSummary.report.title || 'Untitled Bug Report'}
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                    {redactionSummary.report.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-slate-300">
                  {redactionSummary.report.description || 'No description provided.'}
                </p>
                {redactionSummary.report.rootCauseHint && (
                  <p className="text-xs text-purple-300 font-mono pt-1">
                    🔍 {redactionSummary.report.rootCauseHint}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-dark-800/40 border border-white/5 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
                <div>
                  Screenshots: <span className="text-sky-400">{report.screenshots?.length || 0}</span>
                </div>
                <div>
                  Terminal Logs: <span className="text-brand-400">{report.terminalLogs.length}</span>
                </div>
                <div>
                  Browser Errors: <span className="text-amber-400">{report.browserEvents.length}</span>
                </div>
                <div>
                  Timeline Tags: <span className="text-sky-400">{report.events.length}</span>
                </div>
                <div>
                  Secrets Masked: <span className="text-emerald-400">{redactionSummary.totalRedactions}</span>
                </div>
              </div>

              {report.screenshots && report.screenshots.length > 0 && (
                <div className="p-4 rounded-xl bg-dark-800/50 border border-white/10 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-white">
                    <Camera className="w-4 h-4 text-sky-400" />
                    <span>Annotated Screenshots ({report.screenshots.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {report.screenshots.map((shot, idx) => (
                      <div
                        key={shot.id}
                        className="rounded-xl overflow-hidden bg-dark-900 border border-white/10"
                      >
                        <img
                          src={shot.dataUrl}
                          alt={`Screenshot ${idx + 1}`}
                          className="w-full aspect-video object-cover bg-black"
                        />
                        <div className="p-2 flex items-center justify-between text-xs font-mono bg-dark-950/80">
                          <span className="text-slate-400 text-[11px]">
                            #{idx + 1} · {shot.width}×{shot.height}
                          </span>
                          <div className="flex items-center space-x-1.5">
                            {onEditScreenshot && (
                              <button
                                onClick={() => onEditScreenshot(shot)}
                                className="px-2 py-1 rounded bg-white/5 hover:bg-sky-500/20 text-sky-300 text-[11px] flex items-center space-x-1"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                try {
                                  await copyPngToClipboard(shot.dataUrl);
                                  setCopiedShotId(shot.id);
                                  setTimeout(() => setCopiedShotId(null), 1800);
                                } catch {}
                              }}
                              className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-[11px] flex items-center space-x-1"
                            >
                              {copiedShotId === shot.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedShotId === shot.id ? 'Copied' : 'Copy PNG'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-6 py-4 border-t border-white/10 bg-dark-800/60">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadVideo}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 border border-white/10 text-slate-200 text-xs font-medium transition-all"
            >
              <Video className="w-3.5 h-3.5 text-brand-400" />
              <span>.webm</span>
            </button>

            {gifResult ? (
              <button
                onClick={handleDownloadGif}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-all"
              >
                <Film className="w-3.5 h-3.5" />
                <span>.gif ({gifResult.sizeKb} KB)</span>
              </button>
            ) : (
              <button
                onClick={handleExportGif}
                disabled={gifProgress !== null}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 disabled:opacity-50 border border-white/10 text-slate-200 text-xs font-medium transition-all"
              >
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span>{gifProgress !== null ? `GIF ${gifProgress}%` : 'GIF'}</span>
              </button>
            )}

            <button
              onClick={handleExportHtmlBundle}
              disabled={exportingHtml}
              title="Download single offline interactive .html replay file"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-all"
            >
              {exportingHtml ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCode2 className="w-3.5 h-3.5" />}
              <span>Interactive .html</span>
            </button>

            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 border border-white/10 text-slate-200 text-xs font-medium transition-all"
            >
              <Download className="w-3.5 h-3.5 text-brand-400" />
              <span>.md</span>
            </button>

            {wsConnected && (
              <button
                onClick={handleSaveBundleToDisk}
                disabled={savingBundle}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 disabled:opacity-50 border border-white/10 text-slate-200 text-xs font-medium transition-all"
              >
                {savingBundle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5 text-cyan-400" />}
                <span>.bugcast/</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {wsConnected && ghCliAvailable && (
              <button
                onClick={handleCreateGhIssue}
                disabled={creatingGh}
                className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-dark-700 hover:bg-dark-600 border border-purple-500/40 text-purple-300 font-semibold text-xs transition-all"
              >
                {creatingGh ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>gh CLI</span>
              </button>
            )}

            <button
              onClick={() => handleCopyText('ai')}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-600/20 transition-all"
            >
              {copiedType === 'ai' ? <Check className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              <span>{copiedType === 'ai' ? 'Copied Prompt!' : 'Copy AI Fix Prompt'}</span>
            </button>

            <button
              onClick={() => handleCopyText('issue')}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-black font-semibold text-xs shadow-lg shadow-brand-500/20 transition-all"
            >
              {copiedType === 'issue' ? (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Copied Issue!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy GitHub Issue</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
