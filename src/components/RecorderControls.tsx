import React from 'react';
import {
  Play,
  Square,
  Pause,
  RotateCcw,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  Sparkles,
  Captions,
  ImagePlus,
} from 'lucide-react';
import { RecordingSettings, StudioTheme } from '../types';

interface RecorderControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  hasFinishedRecording: boolean;
  settings: RecordingSettings;
  speechSupported: boolean;
  onUpdateSettings: (settings: Partial<RecordingSettings>) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onReset: () => void;
  onCaptureScreenshot: () => void;
  onSnapRecordingFrame: () => void;
}

const STUDIO_THEMES: { id: StudioTheme; label: string; dot: string }[] = [
  { id: 'cyber', label: 'Cyber', dot: 'bg-emerald-400' },
  { id: 'midnight', label: 'Midnight', dot: 'bg-indigo-400' },
  { id: 'sunset', label: 'Sunset', dot: 'bg-rose-400' },
  { id: 'raw', label: 'Raw', dot: 'bg-slate-400' },
];

export const RecorderControls: React.FC<RecorderControlsProps> = ({
  isRecording,
  isPaused,
  hasFinishedRecording,
  settings,
  speechSupported,
  onUpdateSettings,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onReset,
  onCaptureScreenshot,
  onSnapRecordingFrame,
}) => {
  return (
    <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
      {/* Primary Action Buttons */}
      <div className="flex flex-wrap items-center gap-2.5">
        {!isRecording && !hasFinishedRecording && (
          <>
            <button
              onClick={onStartRecording}
              className="flex items-center space-x-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
              <span>Start Studio Recording</span>
            </button>

            <button
              onClick={onCaptureScreenshot}
              className="flex items-center space-x-2 px-4 py-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-300 font-semibold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              title="Take a standalone screenshot with Arrow, Box, and Privacy Blur tools"
            >
              <ImagePlus className="w-4 h-4 text-sky-400" />
              <span>Capture Screenshot</span>
            </button>
          </>
        )}

        {isRecording && (
          <>
            <button
              onClick={onStopRecording}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm shadow-lg shadow-red-600/30 transition-all active:scale-[0.98]"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>Stop & Analyze Bug</span>
            </button>

            <button
              onClick={onSnapRecordingFrame}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-sm font-semibold transition-all"
              title="Snap a high-res screenshot of the current frame"
            >
              <ImagePlus className="w-4 h-4" />
              <span>Snap Frame</span>
            </button>

            {isPaused ? (
              <button
                onClick={onResumeRecording}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-dark-700 hover:bg-dark-600 border border-white/10 text-slate-200 text-sm font-medium transition-all"
              >
                <Play className="w-4 h-4 fill-slate-200" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={onPauseRecording}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-dark-700 hover:bg-dark-600 border border-white/10 text-slate-200 text-sm font-medium transition-all"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            )}
          </>
        )}

        {hasFinishedRecording && (
          <>
            <button
              onClick={onReset}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-dark-750 hover:bg-dark-700 border border-white/10 text-slate-300 hover:text-white text-sm font-medium transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>New Recording</span>
            </button>

            <button
              onClick={onCaptureScreenshot}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-300 text-sm font-semibold transition-all"
            >
              <ImagePlus className="w-4 h-4 text-sky-400" />
              <span>Add Screenshot</span>
            </button>
          </>
        )}
      </div>

      {/* Studio Theme + Capture Toggles */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Studio Frame Theme Selector (Live switchable!) */}
        <div
          title="Studio Canvas Frame Theme (burned into exported video)"
          className="flex items-center space-x-1 bg-dark-800 border border-white/10 rounded-xl p-1 text-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-400 ml-1.5 mr-1" />
          {STUDIO_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onUpdateSettings({ studioTheme: t.id })}
              className={`px-2 py-1 rounded-lg font-medium flex items-center space-x-1.5 transition-all ${
                settings.studioTheme === t.id
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${t.dot}`} />
              <span className="hidden xl:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Mic Toggle */}
        <button
          disabled={isRecording}
          onClick={() => onUpdateSettings({ includeMic: !settings.includeMic })}
          title={settings.includeMic ? 'Microphone Enabled' : 'Microphone Disabled'}
          className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-1.5 ${
            settings.includeMic
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
              : 'bg-dark-800 border-white/10 text-slate-400 hover:text-slate-200'
          } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {settings.includeMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          <span className="hidden md:inline font-medium">Mic</span>
        </button>

        {/* Live Voice Captions */}
        {speechSupported && (
          <button
            disabled={isRecording || !settings.includeMic}
            onClick={() => onUpdateSettings({ liveTranscript: !settings.liveTranscript })}
            title="Real-time voice transcription during recording"
            className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-1.5 ${
              settings.liveTranscript && settings.includeMic
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                : 'bg-dark-800 border-white/10 text-slate-400 hover:text-slate-200'
            } ${isRecording || !settings.includeMic ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Captions className="w-4 h-4" />
            <span className="hidden xl:inline font-medium">Transcript</span>
          </button>
        )}

        {/* Webcam Burn-in Toggle */}
        <button
          disabled={isRecording}
          onClick={() => onUpdateSettings({ includeWebcam: !settings.includeWebcam })}
          title={settings.includeWebcam ? 'Facecam PiP Burn-in Enabled' : 'Facecam PiP Disabled'}
          className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-1.5 ${
            settings.includeWebcam
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
              : 'bg-dark-800 border-white/10 text-slate-400 hover:text-slate-200'
          } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {settings.includeWebcam ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          <span className="hidden md:inline font-medium">Facecam</span>
        </button>

        {/* System Audio Toggle */}
        <button
          disabled={isRecording}
          onClick={() => onUpdateSettings({ recordAudio: !settings.recordAudio })}
          title={settings.recordAudio ? 'System Audio Enabled' : 'System Audio Muted'}
          className={`p-2.5 rounded-xl border transition-all text-xs flex items-center space-x-1.5 ${
            settings.recordAudio
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
              : 'bg-dark-800 border-white/10 text-slate-400 hover:text-slate-200'
          } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {settings.recordAudio ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          <span className="hidden lg:inline font-medium">Audio</span>
        </button>

        {/* Quality Selector */}
        <div className="flex items-center space-x-1 bg-dark-800 border border-white/10 rounded-xl p-1 text-xs">
          {(['720p', '1080p'] as const).map((q) => (
            <button
              key={q}
              disabled={isRecording}
              onClick={() => onUpdateSettings({ videoQuality: q })}
              className={`px-2 py-1 rounded-lg font-mono font-medium transition-all ${
                settings.videoQuality === q
                  ? 'bg-brand-500 text-black font-semibold'
                  : 'text-slate-400 hover:text-white'
              } ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
