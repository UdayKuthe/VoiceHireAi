import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { KeyRound, AlertCircle, ArrowLeft, CheckCircle2, Terminal } from 'lucide-react';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ error: '', success: '', tokenHint: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ error: '', success: '', tokenHint: '' });

    if (!email.trim()) {
      setStatus({ error: 'Please enter your account email address.', success: '', tokenHint: '' });
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.forgotPassword(email);
      setStatus({
        error: '',
        success: res.message || 'Password reset token generated!',
        tokenHint: 'A password reset token has been printed directly to your backend server console.'
      });
    } catch (err) {
      setStatus({ error: err.message || 'Failed to request reset token.', success: '', tokenHint: '' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>

        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
          <KeyRound className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold text-white mb-1">Forgot password</h1>
        <p className="text-sm text-slate-400 mb-6">
          Enter your registered email address to generate a secure reset token.
        </p>

        {status.error && (
          <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <span>{status.error}</span>
          </div>
        )}

        {status.success && (
          <div className="mb-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>{status.success}</span>
            </div>
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 flex items-start gap-2 text-xs text-slate-300 font-mono">
              <Terminal className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>{status.tokenHint}</span>
            </div>
            <div className="pt-2">
              <Link
                to="/reset-password"
                className="inline-block py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
              >
                Go to Reset Password page →
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Account Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@company.com"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Generate Reset Token</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
