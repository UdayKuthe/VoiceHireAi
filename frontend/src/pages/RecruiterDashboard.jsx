import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  Users,
  Calendar,
  Clock,
  PlusCircle,
  CheckCircle,
  XCircle,
  Radio,
  LogOut,
  LayoutDashboard,
  AlertCircle,
  Sparkles,
  CalendarDays,
  User,
  RefreshCw,
  FileText
} from 'lucide-react';

export const RecruiterDashboard = () => {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('overview'); // overview | candidates | interviews
  const [interviews, setInterviews] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal / Form state for Creating Interview
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCandidateId, setNewCandidateId] = useState('');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Fetch interviews
  const fetchInterviews = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.getRecruiterInterviews();
      if (res.interviews) {
        setInterviews(res.interviews);
      }
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to fetch interviews.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Fetch candidates
  const fetchCandidates = useCallback(async () => {
    try {
      const res = await api.getCandidates();
      if (res.candidates) {
        setCandidates(res.candidates);
      }
    } catch (err) {
      console.error('Failed to load candidate list:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchInterviews();
    fetchCandidates();
  }, [fetchInterviews, fetchCandidates]);

  // Polling every 5 seconds for interview readiness / live state updates
  useEffect(() => {
    const timer = setInterval(() => {
      fetchInterviews(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchInterviews]);

  // Handle Mark Ready / Unready toggle
  const handleToggleReady = async (interview) => {
    const nextReady = !interview.recruiterReady;
    setError('');
    setSuccessMsg('');
    setActionLoadingId(interview._id);

    try {
      await api.setRecruiterReady(interview._id, nextReady);
      setSuccessMsg(`Interview marked as ${nextReady ? 'Ready ✓' : 'Unready'}`);
      await fetchInterviews(true);
    } catch (err) {
      setError(err.message || 'Failed to update readiness status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Complete / Cancel
  const handleUpdateStatus = async (interviewId, newStatus) => {
    setError('');
    setSuccessMsg('');
    setActionLoadingId(interviewId);

    try {
      await api.updateInterviewStatus(interviewId, newStatus);
      setSuccessMsg(`Interview marked as ${newStatus}.`);
      await fetchInterviews(true);
    } catch (err) {
      setError(err.message || `Failed to mark interview as ${newStatus}.`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Create Interview submission
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!newTitle.trim() || !newCandidateId) {
      setError('Please provide an interview title and select a candidate.');
      return;
    }

    try {
      setCreateSubmitting(true);
      await api.createInterview({
        title: newTitle.trim(),
        candidateId: newCandidateId,
        scheduledAt: newScheduledAt || null
      });

      setSuccessMsg('Interview scheduled successfully!');
      setShowCreateModal(false);
      setNewTitle('');
      setNewCandidateId('');
      setNewScheduledAt('');
      await fetchInterviews(true);
    } catch (err) {
      setError(err.message || 'Failed to create interview.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const scheduledCount = interviews.filter((i) => ['scheduled', 'reminder', 'recruiter_ready', 'candidate_ready'].includes(i.status)).length;
  const liveCount = interviews.filter((i) => i.status === 'live').length;
  const completedCount = interviews.filter((i) => i.status === 'completed').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between shrink-0 p-5">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight m-0">VoiceHire AI</h2>
              <span className="text-[10px] tracking-widest uppercase font-semibold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                Recruiter
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('interviews')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'interviews'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Interviews</span>
              {interviews.length > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {interviews.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('candidates')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'candidates'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Candidates</span>
              {candidates.length > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {candidates.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
              {user?.name?.slice(0, 2).toUpperCase() || 'RC'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate m-0">{user?.name}</p>
              <p className="text-[11px] text-slate-400 truncate m-0">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 max-w-7xl">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight m-0">Recruiter Workspace</h1>
            <p className="text-sm text-slate-400 mt-1">
              Phase 1 interview readiness, scheduling, and lifecycle coordinator.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchInterviews(false)}
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
              title="Refresh interviews"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Interview</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-sm">
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
            <p className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-1">Total</p>
            <p className="text-3xl font-bold text-white m-0">{interviews.length}</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
            <p className="text-xs uppercase font-semibold text-blue-400 tracking-wider mb-1">Upcoming</p>
            <p className="text-3xl font-bold text-blue-400 m-0">{scheduledCount}</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/30 shadow-sm bg-gradient-to-br from-slate-900 to-emerald-950/20">
            <p className="text-xs uppercase font-semibold text-emerald-400 tracking-wider mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Now
            </p>
            <p className="text-3xl font-bold text-emerald-300 m-0">{liveCount}</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
            <p className="text-xs uppercase font-semibold text-purple-400 tracking-wider mb-1">Completed</p>
            <p className="text-3xl font-bold text-purple-400 m-0">{completedCount}</p>
          </div>
        </div>

        {/* Tab 1: Overview & Interviews */}
        {(activeTab === 'overview' || activeTab === 'interviews') && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 m-0">
                <CalendarDays className="w-5 h-5 text-indigo-400" />
                <span>Interviews Schedule & Readiness Controls</span>
              </h2>
              <span className="text-xs text-slate-400">Auto-refreshing every 5s</span>
            </div>

            {loading && interviews.length === 0 ? (
              <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/50">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-400">Loading interview pipeline...</p>
              </div>
            ) : interviews.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-medium text-slate-300">No interviews created yet</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  Schedule your first interview with a registered candidate to test the readiness flow.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer"
                >
                  Create Interview
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {interviews.map((interview) => (
                  <div
                    key={interview._id}
                    className={`p-5 rounded-2xl bg-slate-900 border transition-all ${
                      interview.status === 'live'
                        ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                        : interview.recruiterReady
                        ? 'border-indigo-500/40'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Info */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-bold text-white m-0">{interview.title}</h3>
                          <StatusBadge status={interview.status} />
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <User className="w-3.5 h-3.5 text-indigo-400" />
                            {interview.candidateId?.name || 'Unassigned'} ({interview.candidateId?.email || 'N/A'})
                          </span>

                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {interview.scheduledAt
                              ? new Date(interview.scheduledAt).toLocaleString()
                              : 'No scheduled date (Draft)'}
                          </span>

                          {interview.status === 'reminder' && (
                            <span className="text-amber-400 font-medium">⚠️ Starting within 30 min</span>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center flex-wrap gap-2.5">
                        {/* Phase 2: Analyze & Plan */}
                        <Link
                          to={`/recruiter/interviews/${interview._id}`}
                          className="py-2 px-3.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Analyze & Plan</span>
                        </Link>

                        {/* Ready / Unready toggle */}
                        {!['completed', 'cancelled'].includes(interview.status) && (
                          <button
                            onClick={() => handleToggleReady(interview)}
                            disabled={actionLoadingId === interview._id || interview.status === 'live'}
                            className={`py-2 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                              interview.recruiterReady
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700 hover:border-indigo-500 hover:text-white'
                            }`}
                          >
                            <Radio className={`w-3.5 h-3.5 ${interview.recruiterReady ? 'text-indigo-400 animate-pulse' : ''}`} />
                            <span>{interview.recruiterReady ? 'Mark Unready' : 'Mark Ready'}</span>
                          </button>
                        )}

                        {/* Complete Button */}
                        {!['completed', 'cancelled'].includes(interview.status) && (
                          <button
                            onClick={() => handleUpdateStatus(interview._id, 'completed')}
                            disabled={actionLoadingId === interview._id}
                            className="py-2 px-3.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-purple-400" />
                            <span>Complete</span>
                          </button>
                        )}

                        {/* Cancel Button */}
                        {!['completed', 'cancelled'].includes(interview.status) && (
                          <button
                            onClick={() => handleUpdateStatus(interview._id, 'cancelled')}
                            disabled={actionLoadingId === interview._id}
                            className="py-2 px-3.5 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Tab 2: Candidates */}
        {activeTab === 'candidates' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 m-0">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>Registered Candidates</span>
            </h2>

            {candidates.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-medium text-slate-300">No candidates registered yet</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
                  When candidates register with the CANDIDATE role, they will appear here.
                </p>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4 font-semibold">Candidate</th>
                      <th className="py-3.5 px-4 font-semibold">Email</th>
                      <th className="py-3.5 px-4 font-semibold">Registered</th>
                      <th className="py-3.5 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {candidates.map((c) => (
                      <tr key={c._id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span>{c.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{c.email}</td>
                        <td className="py-3.5 px-4 text-slate-500 text-xs">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setNewCandidateId(c._id);
                              setShowCreateModal(true);
                            }}
                            className="py-1.5 px-3 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 text-xs font-medium cursor-pointer"
                          >
                            Schedule Interview
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Modal: Create Interview */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white m-0">Schedule New Interview</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                    Interview Title
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Senior Frontend Engineer Technical Screening"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                    Candidate
                  </label>
                  <select
                    required
                    value={newCandidateId}
                    onChange={(e) => setNewCandidateId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="">-- Select a candidate --</option>
                    {candidates.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                    Scheduled Date & Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newScheduledAt}
                    onChange={(e) => setNewScheduledAt(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Leave blank to save as Draft.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="py-2.5 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSubmitting}
                    className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
                  >
                    {createSubmitting ? 'Creating...' : 'Create & Schedule'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default RecruiterDashboard;
