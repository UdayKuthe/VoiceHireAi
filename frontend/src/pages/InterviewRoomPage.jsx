import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Video, Mic, ArrowLeft, ShieldCheck, Radio, Sparkles } from 'lucide-react';

export const InterviewRoomPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const interview = location.state?.interview;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/candidate')}
            className="p-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Leave Room"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white m-0">
              {interview?.title || 'VoiceHire Interview Session'}
            </h1>
            <p className="text-xs text-slate-400 m-0">Session ID: {id}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            SESSION LIVE
          </span>
        </div>
      </header>

      {/* Main Video/Audio Placeholder Canvas */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-3xl p-10 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          {/* Subtle glow */}
          <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-600/20 text-white">
            <Video className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            Connected to Interview Room
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Both recruiter readiness and candidate join handshake succeeded. Status has transitioned to <span className="text-emerald-400 font-semibold font-mono">live</span>.
          </p>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-left space-y-2 mb-8 max-w-md mx-auto text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Candidate:</span>
              <span className="text-slate-200 font-medium">{user?.name} ({user?.email})</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Readiness State:</span>
              <span className="text-emerald-400 font-semibold">Candidate Joined ✓</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Next Phase (Phase 2):</span>
              <span className="text-indigo-300 font-medium">Real-time Audio / LiveKit Stream</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-4">
            <div className="p-3 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              <Mic className="w-5 h-5" />
            </div>
            <div className="p-3 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
              <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <button
              onClick={() => navigate('/candidate')}
              className="py-2.5 px-6 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Exit Room
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default InterviewRoomPage;
