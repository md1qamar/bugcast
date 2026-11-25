import React, { useState } from 'react';
import { Tag, Bug, AlertTriangle, Palette, Plus, Trash2, Clock, Mic } from 'lucide-react';
import { TimecodedEvent, TranscriptSegment } from '../types';

interface EventTaggerProps {
  isRecording: boolean;
  recordingTime: number;
  events: TimecodedEvent[];
  transcript: TranscriptSegment[];
  interimTranscript: string;
  onAddEvent: (event: Omit<TimecodedEvent, 'id'>) => void;
  onRemoveEvent: (id: string) => void;
}

export const EventTagger: React.FC<EventTaggerProps> = ({
  isRecording,
  recordingTime,
  events,
  transcript,
  interimTranscript,
  onAddEvent,
  onRemoveEvent,
}) => {
  const [customTitle, setCustomTitle] = useState('');

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const handleQuickTag = (type: TimecodedEvent['type'], title: string) => {
    onAddEvent({
      timestampSeconds: recordingTime,
      formattedTime: formatTime(recordingTime),
      type,
      title,
    });
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    onAddEvent({
      timestampSeconds: recordingTime,
      formattedTime: formatTime(recordingTime),
      type: 'custom',
      title: customTitle.trim(),
    });
    setCustomTitle('');
  };

  return (
    <div className="glass-panel p-4 rounded-2xl space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Tag className="w-4 h-4 text-brand-400" />
          <h4 className="text-sm font-semibold text-white">Timeline Moment Tagger</h4>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {events.length} {events.length === 1 ? 'marker' : 'markers'}
        </span>
      </div>

      {/* Quick Tagging Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => handleQuickTag('bug', 'Bug Reproduced')}
          className="flex items-center justify-center space-x-1.5 p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium transition-all"
        >
          <Bug className="w-3.5 h-3.5" />
          <span>Bug Here</span>
        </button>

        <button
          onClick={() => handleQuickTag('api-fail', 'API / Network Error')}
          className="flex items-center justify-center space-x-1.5 p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium transition-all"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>API 500 Fail</span>
        </button>

        <button
          onClick={() => handleQuickTag('ui-glitch', 'UI Broken / Layout Shift')}
          className="flex items-center justify-center space-x-1.5 p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-medium transition-all"
        >
          <Palette className="w-3.5 h-3.5" />
          <span>UI Glitch</span>
        </button>

        <button
          onClick={() => handleQuickTag('note', 'Key Interaction')}
          className="flex items-center justify-center space-x-1.5 p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-medium transition-all"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Key Step</span>
        </button>
      </div>

      {/* Custom Note input */}
      <form onSubmit={handleAddCustom} className="flex gap-2">
        <input
          type="text"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder={`Tag time (${formatTime(recordingTime)}) e.g. "Submitted checkout form"`}
          className="flex-1 bg-dark-800/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!customTitle.trim()}
          className="px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-black text-xs font-semibold flex items-center space-x-1 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tag</span>
        </button>
      </form>

      {/* Live Voice Captions Strip */}
      {(isRecording || transcript.length > 0) && (interimTranscript || transcript.length > 0) && (
        <div className="p-2.5 rounded-xl bg-sky-500/5 border border-sky-500/20 space-y-1">
          <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-sky-400">
            <Mic className="w-3 h-3" />
            <span>Voice Transcript</span>
          </div>
          <div className="max-h-20 overflow-y-auto space-y-1 text-xs text-slate-300">
            {transcript.map((seg) => (
              <div key={seg.id} className="flex space-x-2">
                <span className="font-mono text-sky-400 text-[10px] mt-0.5">{seg.formattedTime}</span>
                <span>{seg.text}</span>
              </div>
            ))}
            {interimTranscript && (
              <div className="text-slate-400 italic text-[11px]">{interimTranscript}...</div>
            )}
          </div>
        </div>
      )}

      {/* Tagged Timeline List */}
      {events.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between p-2 rounded-lg bg-dark-800/40 border border-white/5 text-xs text-slate-300"
            >
              <div className="flex items-center space-x-2 min-w-0">
                <span className="font-mono text-brand-400 font-semibold bg-dark-900 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                  {event.formattedTime}
                </span>
                <span className="font-medium truncate">{event.title}</span>
              </div>
              <button
                onClick={() => onRemoveEvent(event.id)}
                className="text-slate-500 hover:text-red-400 p-1 transition-colors shrink-0"
                title="Delete marker"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
