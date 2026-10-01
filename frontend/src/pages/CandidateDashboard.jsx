import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  User,
  Calendar,
  Clock,
  Radio,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Video,
  Sparkles,
  History,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export const CandidateDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);
  const [error, setError] = useState('');

  // Fetch candidate's interviews
  const fetchInterviews = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.getCandidateInterviews();
      if (res.interviews) {
        setInterviews(res.interviews);
      }
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load interviews.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  // Polling every 5 seconds for recruiter readiness updates
  useEffect(() => {
    const timer = setInterval(() => {
      fetchInterviews(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchInterviews]);

  // Handle Join Interview
  const handleJoin = async (interviewId) => {
    setError('');
    setJoiningId(interviewId);

    try {
      const res = await api.joinInterview(interviewId);
      // Navigate to the placeholder interview room
      navigate(`/candidate/interview/${interviewId}/room`, {
        state: { interview: res.interview }
      });
    } catch (err) {
      setError(err.message || 'Failed to join interview.');
      setJoiningId(null);
    }
  };

  // Split into upcoming and history
  const upcomingInterviews = interviews.filter(
    (i) => !['completed', 'cancelled'].includes(i.status)
  );

  const pastInterviews = interviews.filter((i) =>
    ['completed', 'cancelled'].includes(i.status)
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight m-0">VoiceHire AI</h1>
            <span className="text-[10px] tracking-widest uppercase font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              Candidate Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => fetchInterviews(false)}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
            title="Refresh interviews"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="h-6 w-px bg-slate-800" />

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-300">
              {user?.name?.slice(0, 2).toUpperCase() || 'CD'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-white leading-tight m-0">{user?.name}</p>
              <p className="text-[11px] text-slate-400 m-0">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="py-1.5 px-3 rounded-xl border border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 text-slate-300 hover:text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8">
        {/* Profile Summary Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/30 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xl font-bold">
              <User className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white m-0">{user?.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                  Verified Candidate
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 py-2 px-3.5 rounded-xl border border-slate-800">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Readiness radar active (polls every 5s)</span>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: Upcoming Interviews */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 m-0">
              <Calendar className="w-5 h-5 text-emerald-400" />
              <span>Upcoming Interviews</span>
            </h2>
            <span className="text-xs text-slate-400 font-medium">
              {upcomingInterviews.length} Scheduled
            </span>
          </div>

          {loading && upcomingInterviews.length === 0 ? (
            <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/50">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading your upcoming interviews...</p>
            </div>
          ) : upcomingInterviews.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
              <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-medium text-slate-300">No interviews scheduled yet</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
                When recruiters schedule an interview with you, it will appear here with live readiness tracking.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {upcomingInterviews.map((interview) => {
                const isWithin30Min = interview.status === 'reminder';

                return (
                  <div
                    key={interview._id}
                    className={`p-6 rounded-2xl bg-slate-900 border transition-all ${
                      interview.status === 'live'
                        ? 'border-emerald-500 shadow-xl shadow-emerald-500/10 bg-emerald-950/10'
                        : interview.recruiterReady
                        ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* 30-min Reminder Banner */}
                    {isWithin30Min && (
                      <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-amber-300 text-xs font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 animate-bounce" />
                        <span>
                          Reminder: Your interview is starting within 30 minutes! Please stay on this page.
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-bold text-white m-0">{interview.title}</h3>
                          <StatusBadge status={interview.status} />
                        </div>

                        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-400">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <User className="w-3.5 h-3.5 text-emerald-400" />
                            Recruiter: {interview.recruiterId?.name || 'Recruiter'} (
                            {interview.recruiterId?.email})
                          </span>

                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {interview.scheduledAt
                              ? new Date(interview.scheduledAt).toLocaleString()
                              : 'Pending Schedule'}
                          </span>
                        </div>

                        {/* Recruiter Readiness Indicator Badge */}
                        <div className="pt-1 flex items-center gap-2">
                          <span className="text-xs text-slate-400">Recruiter Status:</span>
                          {interview.recruiterReady ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              Recruiter: Ready ✓
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                              <XCircle className="w-3.5 h-3.5 text-slate-500" />
                              Recruiter: Not ready
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Join Action */}
                      <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
                        <button
                          onClick={() => handleJoin(interview._id)}
                          disabled={!interview.recruiterReady || joiningId === interview._id}
                          className={`py-3 px-6 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                            interview.recruiterReady
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                          }`}
                        >
                          {joiningId === interview._id ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Joining Session...</span>
                            </>
                          ) : (
                            <>
                              <Video className="w-4 h-4" />
                              <span>Join Interview</span>
                            </>
                          )}
                        </button>

                        {!interview.recruiterReady && (
                          <span className="text-[11px] text-slate-500">
                            Join will activate automatically when recruiter marks Ready
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Interview History */}
        <section className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 m-0">
              <History className="w-5 h-5 text-indigo-400" />
              <span>Interview History</span>
            </h2>
            <span className="text-xs text-slate-500">{pastInterviews.length} Past</span>
          </div>

          {pastInterviews.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No past completed or cancelled interviews.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {pastInterviews.map((item) => (
                <div
                  key={item._id}
                  className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-200 m-0">{item.title}</p>
                    <p className="text-xs text-slate-500 m-0">
                      Recruiter: {item.recruiterId?.name} •{' '}
                      {item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default CandidateDashboard;
