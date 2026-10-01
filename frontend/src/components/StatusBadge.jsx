export const StatusBadge = ({ status }) => {
  const map = {
    draft: {
      label: 'Draft',
      classes: 'bg-slate-800 text-slate-300 border-slate-700'
    },
    scheduled: {
      label: 'Scheduled',
      classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    },
    reminder: {
      label: 'Reminder (<30m)',
      classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
    },
    recruiter_ready: {
      label: 'Recruiter Ready',
      classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
    },
    candidate_ready: {
      label: 'Candidate Ready',
      classes: 'bg-teal-500/10 text-teal-400 border-teal-500/30'
    },
    live: {
      label: 'LIVE SESSION',
      classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-2 ring-emerald-500/20'
    },
    completed: {
      label: 'Completed',
      classes: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
    },
    cancelled: {
      label: 'Cancelled',
      classes: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    }
  };

  const current = map[status] || {
    label: status,
    classes: 'bg-slate-800 text-slate-300 border-slate-700'
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${current.classes}`}
    >
      {status === 'live' && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
      )}
      {current.label}
    </span>
  );
};

export default StatusBadge;
