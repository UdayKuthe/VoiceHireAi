import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { UserPlus, AlertCircle, ArrowRight, ShieldCheck, Briefcase, UserCheck } from 'lucide-react';

export const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('RECRUITER');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { user, register, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  if (!loading && isAuthenticated) {
    const destination = user?.role === 'RECRUITER' ? '/recruiter' : '/candidate';
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    try {
      setSubmitting(true);
      const user = await register({ name, email, password, role });
      navigate(user.role === 'RECRUITER' ? '/recruiter' : '/candidate', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white m-0">VoiceHire AI</h1>
            <p className="text-xs text-slate-400">Phase 1 Authentication & Dashboards</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-slate-200 mb-1">Create an account</h2>
        <p className="text-sm text-slate-400 mb-6">Select your role to get started.</p>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2 uppercase tracking-wider">
              Account Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('RECRUITER')}
                className={`py-3 px-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-xs font-medium cursor-pointer ${
                  role === 'RECRUITER'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-2 ring-indigo-500/40'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Briefcase className="w-4 h-4 text-indigo-400" />
                <span>Recruiter</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('CANDIDATE')}
                className={`py-3 px-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-xs font-medium cursor-pointer ${
                  role === 'CANDIDATE'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/40'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Candidate</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sarah Connor"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sarah@example.com"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Password (min 6 characters)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Create Account</span>
                <UserPlus className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-sm text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 hover:underline">
              Sign in here <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
