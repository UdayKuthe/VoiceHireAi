import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';
import {
  Radio,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  ListOrdered,
  Layers,
  StopCircle,
  RefreshCw,
  Loader2,
  FileCheck
} from 'lucide-react';

export const RecruiterObserverPanel = ({ interviewId, onInterviewEnded }) => {
  const [liveState, setLiveState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Poll live-state every 3 seconds per PRD §15 S10
  const fetchLiveState = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.getLiveState(interviewId);
      if (res.liveState) {
        setLiveState(res.liveState);
      }
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load live interview state.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [interviewId]);

  useEffect(() => {
    fetchLiveState();
    const interval = setInterval(() => {
      fetchLiveState(true);
    }, 3000); // 3 second polling loop
    return () => clearInterval(interval);
  }, [fetchLiveState]);

  // Recruiter End Interview Handler
  const handleEndInterview = async () => {
    if (!window.confirm('Are you sure you want to conclude and finalize this interview session?')) {
      return;
    }
    setActionLoading(true);
    try {
      await api.endInterview(interviewId);
      await fetchLiveState(false);
      if (onInterviewEnded) onInterviewEnded();
    } catch (err) {
      setError(err.message || 'Failed to terminate interview.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'sufficiently_verified':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'partially_verified':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'unverified':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/40';
      case 'contradictory':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    }
  };

  const formatElapsed = (ms) => {
    if (!ms) return '00:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading && !liveState) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-indigo-400" />
        <span>Connecting to live session telemetry...</span>
      </div>
    );
  }

  const isLive = liveState?.status === 'live' || liveState?.status === 'active';
  const isCompleted = liveState?.status === 'completed' || liveState?.status === 'completed_partial';

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            isLive
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : isCompleted
              ? 'bg-slate-800 text-slate-300 border-slate-700'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
            {isLive ? 'SESSION ACTIVE (POLLING 3s)' : (liveState?.status?.toUpperCase() || 'STANDBY')}
          </span>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Elapsed: {formatElapsed(liveState?.elapsedMs)}</span>
          </div>

          <div className="text-xs text-slate-400">
            Phase: <strong className="text-white capitalize">{liveState?.phase || 'Introduction'}</strong>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLiveState(false)}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 transition-all cursor-pointer"
            title="Refresh State Now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isLive && (
            <button
              onClick={handleEndInterview}
              disabled={actionLoading}
              className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-rose-600/20"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
              <span>Conclude Interview</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Current Question & Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Current Question */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 m-0 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>Current Spoken Question</span>
            </h4>
            {liveState?.current_question?.kind && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {liveState.current_question.kind}
              </span>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-850">
            <p className="text-sm font-medium text-slate-200 leading-relaxed m-0">
              {liveState?.current_question?.text ? `"${liveState.current_question.text}"` : 'Awaiting question generation...'}
            </p>
          </div>

          {liveState?.progress && (
            <div className="grid grid-cols-3 gap-3 text-xs pt-2">
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-850">
                <span className="text-slate-400 block text-[10px] uppercase">Section Index</span>
                <span className="text-white font-bold">{liveState.progress.sectionIdx + 1}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-850">
                <span className="text-slate-400 block text-[10px] uppercase">Group Index</span>
                <span className="text-white font-bold">{liveState.progress.groupIdx + 1}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-850">
                <span className="text-slate-400 block text-[10px] uppercase">Probes Used</span>
                <span className="text-white font-bold">{liveState.progress.probesUsed} / 2</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Open Evidence Gaps */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 m-0 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Open Evidence Gaps ({liveState?.evidence_gaps?.length || 0})</span>
          </h4>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {liveState?.evidence_gaps && liveState.evidence_gaps.length > 0 ? (
              liveState.evidence_gaps.map((gap, i) => (
                <div key={gap.id || i} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs">
                  <div className="font-semibold text-amber-300 mb-1">{gap.description}</div>
                  <div className="text-[10px] text-slate-400">Target: {gap.targetRef?.key || 'Focus area'}</div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic m-0">No open evidence gaps currently flagged.</p>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Skill Evidence State */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 m-0 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Real-time Competency Verification State</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {liveState?.skill_state && Object.keys(liveState.skill_state).length > 0 ? (
            Object.entries(liveState.skill_state).map(([skillName, data]) => (
              <div key={skillName} className="p-3 rounded-xl bg-slate-950/60 border border-slate-850 flex flex-col justify-between gap-2">
                <span className="text-xs font-semibold text-white truncate" title={skillName}>
                  {skillName}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border w-fit ${getStatusBadgeColor(data.status)}`}>
                  {data.status?.replace('_', ' ')}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 italic col-span-4 m-0">Competencies will populate as answers are evaluated.</p>
          )}
        </div>
      </div>

      {/* Real-time Claim Verification */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 m-0 flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-teal-400" />
          <span>Resume Claims Verification</span>
        </h4>

        <div className="space-y-2">
          {liveState?.claim_verification && Object.keys(liveState.claim_verification).length > 0 ? (
            Object.entries(liveState.claim_verification).map(([claimKey, data]) => (
              <div key={claimKey} className="p-3 rounded-xl bg-slate-950/60 border border-slate-850 flex items-center justify-between gap-4 text-xs">
                <span className="text-slate-300 flex-1 leading-relaxed">{data.claimText || claimKey}</span>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${getStatusBadgeColor(data.status)}`}>
                  {data.status?.replace('_', ' ')}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 italic m-0">Project claims will be evaluated during respective project questions.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecruiterObserverPanel;

