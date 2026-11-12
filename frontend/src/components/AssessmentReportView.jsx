import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  User,
  Briefcase,
  FileText,
  ChevronDown,
  ChevronUp,
  Printer,
  Sparkles,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Quote,
  MessageSquare,
  Layers,
  RefreshCw
} from 'lucide-react';

export const AssessmentReportView = ({ interviewId }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSkill, setExpandedSkill] = useState(null);
  const [showFullTranscript, setShowFullTranscript] = useState(true);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getAssessmentReport(interviewId);
      if (res.report) {
        setReport(res.report);
      } else {
        setError('Report data not available.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load assessment report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (interviewId) {
      fetchReport();
    }
  }, [interviewId]);

  if (loading) {
    return (
      <div className="p-16 text-center border border-slate-800 rounded-2xl bg-slate-900/30">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-300 font-medium">Generating & Loading Assessment Report...</p>
        <p className="text-xs text-slate-500 mt-1">Evaluating candidate responses, skill verification, and recommendation</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">Assessment Report Not Ready Yet</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mb-5 leading-relaxed">
          {error || 'The interview assessment report is generated once the interview session is concluded and finalized.'}
        </p>
        <button
          onClick={fetchReport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Check Again</span>
        </button>
      </div>
    );
  }

  const rec = report.recommendation || {};
  const metrics = rec.metrics || {};
  const skills = report.skillsAssessed || [];
  const claims = report.claims || [];
  const gaps = report.remainingGaps || [];
  const history = report.questionAnswerHistory || [];

  // Theme colors based on decision
  const decisionTheme = {
    strong_hire: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      icon: CheckCircle2
    },
    hire: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      text: 'text-blue-400',
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      icon: CheckCircle2
    },
    lean_hire: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: HelpCircle
    },
    consider: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: HelpCircle
    },
    do_not_hire: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      text: 'text-rose-400',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      icon: XCircle
    }
  }[rec.decision || 'consider'] || {
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    text: 'text-slate-400',
    badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    icon: HelpCircle
  };

  const DecisionIcon = decisionTheme.icon;

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'sufficiently_verified':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Sufficiently Verified
          </span>
        );
      case 'partially_verified':
      case 'observed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" /> Partially Verified
          </span>
        );
      case 'unverified':
      case 'contradictory':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Unverified
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            Not Assessed
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Print Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white m-0">Candidate Assessment Report & Evaluation</h2>
            {report.partial && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Partial Interview
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 m-0">
            Generated on {new Date(report.generatedAt || report.createdAt).toLocaleString()} • Concluded by {report.endedBy || 'recruiter'}
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print / Export Report</span>
        </button>
      </div>

      {/* Hero Recommendation Card */}
      <div className={`p-6 rounded-2xl ${decisionTheme.bg} border ${decisionTheme.border} relative overflow-hidden`}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Recommendation Info */}
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider border ${decisionTheme.badge}`}>
                <DecisionIcon className="w-4 h-4" />
                <span>{rec.label || 'Evaluation Complete'}</span>
              </span>
              <span className="text-xs text-slate-400">
                Candidate Competency Evaluation
              </span>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed font-normal m-0">
              {rec.summary || report.summaryText}
            </p>

            {/* Candidate Summary Line */}
            {report.candidateSummary && (
              <p className="text-xs text-slate-400 italic m-0 pt-1 border-t border-slate-800/60">
                "{report.candidateSummary}"
              </p>
            )}
          </div>

          {/* Score Gauge / Metrics Card */}
          <div className="flex items-center gap-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 w-full lg:w-auto min-w-[240px] justify-around">
            <div className="text-center">
              <div className="text-3xl font-extrabold text-white tracking-tight">
                {rec.score ?? 0}<span className="text-sm font-semibold text-slate-400">%</span>
              </div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">
                Match Score
              </div>
            </div>

            <div className="w-[1px] h-10 bg-slate-800" />

            <div className="text-xs space-y-1">
              <div className="text-slate-400">
                Verified Skills: <span className="text-emerald-400 font-bold">{metrics.verifiedSkillsCount || 0}</span> / {metrics.totalSkillsCount || skills.length}
              </div>
              <div className="text-slate-400">
                Verified Claims: <span className="text-indigo-400 font-bold">{metrics.verifiedClaimsCount || 0}</span> / {metrics.totalClaimsCount || claims.length}
              </div>
              <div className="text-slate-400">
                Duration: <span className="text-slate-200 font-semibold">{metrics.durationFormatted || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Next Steps */}
        {rec.suggestedNextSteps?.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-800/50">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
              <span>Recommended Next Steps for Hiring Team</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {rec.suggestedNextSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 text-xs text-slate-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Two-Column: Key Strengths & Potential Concerns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Strengths */}
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-emerald-500/20 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Key Strengths & Verified Areas</span>
          </div>
          <div className="space-y-2">
            {(rec.strengths || []).map((str, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>{str}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Concerns / Open Gaps */}
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-amber-500/20 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>Key Concerns & Open Evidence Gaps</span>
          </div>
          <div className="space-y-2">
            {(rec.concerns || []).map((con, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                <span>{con}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section: Competency Verification Matrix */}
      <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white m-0">Detailed Technical Competency Matrix</h3>
          </div>
          <span className="text-xs text-slate-400">
            {skills.length} Competencies Assessed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {skills.map((skill, idx) => {
            const isExpanded = expandedSkill === idx;
            const hasSnippets = skill.snippets && skill.snippets.length > 0;

            return (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{skill.name}</span>
                  {renderStatusBadge(skill.status)}
                </div>

                {hasSnippets && (
                  <div>
                    <button
                      onClick={() => setExpandedSkill(isExpanded ? null : idx)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>{isExpanded ? 'Hide Spoken Evidence' : `View Spoken Evidence (${skill.snippets.length})`}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-1.5 pt-2 border-t border-slate-800/80">
                        {skill.snippets.map((snip, sIdx) => (
                          <div key={sIdx} className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2">
                            <Quote className="w-3 h-3 text-indigo-400 flex-shrink-0 mt-0.5" />
                            <span className="italic leading-relaxed">"{snip}"</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section: Project Claims Verification */}
      {claims.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white m-0">Resume Project Claims Verification</h3>
          </div>

          <div className="space-y-2.5">
            {claims.map((claim, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 max-w-xl">
                  {claim.project && (
                    <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider block">
                      {claim.project}
                    </span>
                  )}
                  <p className="text-xs text-slate-200 m-0 leading-relaxed">{claim.text}</p>
                  {claim.notes && (
                    <p className="text-[11px] text-slate-400 m-0 italic">Evaluator Note: {claim.notes}</p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {renderStatusBadge(claim.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section: Chronological Interview Transcript */}
      {history.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white m-0">Turn-by-Turn Interview Transcript</h3>
            </div>
            <button
              onClick={() => setShowFullTranscript(!showFullTranscript)}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              <span>{showFullTranscript ? 'Collapse' : 'Expand All'}</span>
              {showFullTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showFullTranscript && (
            <div className="space-y-3">
              {history.map((turn, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-indigo-400">Turn #{turn.seq || idx + 1} • {turn.kind === 'probe' ? 'Targeted Follow-up' : 'Core Question'}</span>
                    {turn.group && <span>Group: {turn.group}</span>}
                  </div>

                  {/* Interviewer Question */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Interviewer</span>
                    <p className="text-xs font-semibold text-slate-200 m-0">{turn.question}</p>
                  </div>

                  {/* Candidate Answer */}
                  <div className="space-y-1 pl-3 border-l-2 border-indigo-500/40">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Candidate Response</span>
                    <p className="text-xs text-slate-300 m-0 leading-relaxed">
                      {turn.answer || <span className="italic text-slate-500">No verbal response recorded.</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AssessmentReportView;
