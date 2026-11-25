import React, { useRef, useState } from 'react';
import { CheckCircle2, Play, Pause, AlertTriangle, Bug, MessageSquare } from 'lucide-react';
import { BrowserEventEntry, TerminalLogEntry, TimecodedEvent, TranscriptSegment } from '../types';

interface SyncedReplayViewProps {
  videoUrl: string;
  durationSeconds: number;
  events: TimecodedEvent[];
  terminalLogs: TerminalLogEntry[];
  browserEvents: BrowserEventEntry[];
  transcript: TranscriptSegment[];
}

export const SyncedReplayView: React.FC<SyncedReplayViewProps> = ({
  videoUrl,
  durationSeconds,
  events,
  terminalLogs,
  browserEvents,
  transcript,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const safeDuration = Math.max(1, durationSeconds);

  const seekTo = (secs: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(safeDuration, secs));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    videoRef.current.play().catch(() => {});
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Merge timeline items for interactive click-to-seek feed
  const syncedItems = [
    ...events.map((e) => ({
      id: e.id,
      time: e.timestampSeconds,
      label: e.title,
      kind: 'event' as const,
    })),
    ...terminalLogs
      .filter((l) => l.isError && typeof l.offsetSeconds === 'number')
      .map((l) => ({
        id: l.id,
        time: l.offsetSeconds || 0,
        label: `[Terminal] ${l.text.slice(0, 90)}`,
        kind: 'error' as const,
      })),
    ...browserEvents
      .filter((b) => typeof b.offsetSeconds === 'number')
      .map((b) => ({
        id: b.id,
        time: b.offsetSeconds || 0,
        label: `[Browser] ${b.message.slice(0, 90)}`,
        kind: 'error' as const,
      })),
    ...transcript.map((t) => ({
      id: t.id,
      time: t.timestampSeconds,
      label: `"${t.text}"`,
      kind: 'voice' as const,
    })),
  ].sort((a, b) => a.time - b.time);

  return (
    <div className="space-y-3">
      {/* Studio Video Player */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
          className="w-full h-full object-contain cursor-pointer"
        />

        <div className="absolute top-3 left-3 pointer-events-none bg-brand-500/90 backdrop-blur-md text-black font-semibold text-xs px-3 py-1 rounded-full flex items-center space-x-1.5 shadow-lg">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Synced Replay Ready</span>
        </div>

        {/* Custom Timeline Bar with Error/Event Pins */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3 pt-6 space-y-2">
          <div
            className="relative h-2 bg-white/20 rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              seekTo(ratio * safeDuration);
            }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-brand-500 rounded-full transition-all duration-75"
              style={{ width: `${Math.min(100, (currentTime / safeDuration) * 100)}%` }}
            />
            {syncedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                title={`${formatTime(item.time)} — ${item.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(item.time);
                }}
                style={{ left: `${Math.min(98, (item.time / safeDuration) * 100)}%` }}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border border-black transition-transform hover:scale-150 ${
                  item.kind === 'error'
                    ? 'bg-red-500'
                    : item.kind === 'voice'
                      ? 'bg-sky-400'
                      : 'bg-amber-400'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-slate-300">
            <button
              onClick={togglePlay}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <span>
              {formatTime(currentTime)} / {formatTime(safeDuration)}
            </span>
          </div>
        </div>
      </div>

      {/* Click-to-Seek Synced Timeline Strip */}
      {syncedItems.length > 0 && (
        <div className="glass-panel p-3.5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white">Click Any Moment or Error to Seek Video</span>
            <span className="text-[11px] text-slate-400 font-mono">{syncedItems.length} synced markers</span>
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
            {syncedItems.map((item) => {
              const isActive = Math.abs(currentTime - item.time) < 1.5;
              return (
                <button
                  key={item.id}
                  onClick={() => seekTo(item.time)}
                  className={`w-full text-left flex items-center space-x-2 p-2 rounded-lg text-xs transition-all border ${
                    isActive
                      ? 'bg-brand-500/15 border-brand-500/40 text-white'
                      : 'bg-dark-800/50 border-white/5 text-slate-300 hover:bg-dark-750'
                  }`}
                >
                  <span className="font-mono text-[11px] font-bold text-brand-400 bg-dark-900 px-1.5 py-0.5 rounded shrink-0">
                    {formatTime(item.time)}
                  </span>
                  {item.kind === 'error' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  ) : item.kind === 'voice' ? (
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  ) : (
                    <Bug className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate font-mono text-[11px]">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
