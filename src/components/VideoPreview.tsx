import React, { useRef, useEffect } from 'react';
import { Monitor, Sparkles, Terminal, Cpu } from 'lucide-react';
import { BrowserEventEntry, TerminalLogEntry, TimecodedEvent, TranscriptSegment } from '../types';
import { SyncedReplayView } from './SyncedReplayView';

interface VideoPreviewProps {
  isRecording: boolean;
  hasFinishedRecording: boolean;
  compositedStream: MediaStream | null;
  recordedVideoUrl: string | null;
  recordingTime: number;
  events: TimecodedEvent[];
  terminalLogs: TerminalLogEntry[];
  browserEvents: BrowserEventEntry[];
  transcript: TranscriptSegment[];
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  isRecording,
  hasFinishedRecording,
  compositedStream,
  recordedVideoUrl,
  recordingTime,
  events,
  terminalLogs,
  browserEvents,
  transcript,
}) => {
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (liveVideoRef.current && compositedStream) {
      liveVideoRef.current.srcObject = compositedStream;
    }
  }, [compositedStream]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  if (hasFinishedRecording && recordedVideoUrl) {
    return (
      <SyncedReplayView
        videoUrl={recordedVideoUrl}
        durationSeconds={recordingTime}
        events={events}
        terminalLogs={terminalLogs}
        browserEvents={browserEvents}
        transcript={transcript}
      />
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-dark-900 border border-white/10 shadow-2xl flex items-center justify-center">
      {isRecording ? (
        <div className="w-full h-full relative bg-black">
          <video
            ref={liveVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-full flex items-center space-x-2 text-white text-xs font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span>STUDIO COMPOSITOR LIVE · {formatTime(recordingTime)}</span>
          </div>
        </div>
      ) : (
        <div className="text-center p-6 sm:p-8 max-w-lg">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-400 mx-auto flex items-center justify-center mb-4">
            <Monitor className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">BugCast Studio Ready</h3>
          <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
            Record your app inside a Studio frame with burned-in Facecam PiP, synced terminal crashes, live voice captions, and 1-click GIF / GitHub Issue export.
          </p>

          <div className="grid grid-cols-3 gap-2.5 text-left">
            <div className="p-3 rounded-xl bg-dark-800/70 border border-white/5">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-brand-400 mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Studio Frame</span>
              </div>
              <p className="text-[11px] text-slate-400">Gradient backdrop + burned-in facecam &amp; GIF export.</p>
            </div>
            <div className="p-3 rounded-xl bg-dark-800/70 border border-white/5">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-cyan-400 mb-1">
                <Terminal className="w-3.5 h-3.5" />
                <span>Terminal Sync</span>
              </div>
              <p className="text-[11px] text-slate-400">Click any log error to jump video to exact second.</p>
            </div>
            <div className="p-3 rounded-xl bg-dark-800/70 border border-white/5">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-purple-400 mb-1">
                <Cpu className="w-3.5 h-3.5" />
                <span>Local AI</span>
              </div>
              <p className="text-[11px] text-slate-400">Auto-analyzes logs, git diff &amp; voice locally.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
