import React from 'react';
import { X, Play, Trash2, Calendar, Clock, FileText, Download } from 'lucide-react';
import { BugReport } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  reports: BugReport[];
  onClose: () => void;
  onSelectReport: (report: BugReport) => void;
  onDeleteReport: (id: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  reports,
  onClose,
  onSelectReport,
  onDeleteReport,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="absolute inset-y-0 right-0 max-w-md w-full bg-dark-900 border-l border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-dark-800/60">
          <div>
            <h3 className="text-base font-bold text-white">Local Recordings Vault</h3>
            <p className="text-xs text-slate-400">Stored safely on your device (IndexedDB)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of recordings */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {reports.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No recorded sessions yet</p>
              <p className="text-xs text-slate-600 mt-1">
                Hit "Start Session Recording" to create your first report.
              </p>
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="p-4 rounded-xl bg-dark-800/80 border border-white/5 hover:border-brand-500/30 transition-all space-y-3 group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-brand-400 transition-colors">
                      {report.title || 'Untitled Bug Session'}
                    </h4>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-1">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{Math.floor(report.videoDurationSeconds)}s</span>
                      </span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-dark-750 text-slate-300 border border-white/5">
                    {report.severity}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <button
                    onClick={() => onSelectReport(report)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 text-xs font-semibold transition-all"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Issue</span>
                  </button>

                  <button
                    onClick={() => onDeleteReport(report.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete recording"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
