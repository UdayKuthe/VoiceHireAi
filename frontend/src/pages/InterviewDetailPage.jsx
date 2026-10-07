import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Edit3,
  Save,
  ArrowUp,
  ArrowDown,
  Trash2,
  FileCheck,
  Briefcase,
  Layers,
  ListOrdered,
  AlertTriangle,
  FileCode,
  ShieldAlert,
  Sliders,
  Star,
  FolderGit2,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  User,
  HelpCircle
} from 'lucide-react';

export const InterviewDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('resume'); // resume | jd | mapping | plan
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Upload state
  const resumeInputRef = useRef(null);
  const jdInputRef = useRef(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [jdUploading, setJdUploading] = useState(false);

  // Edit state for Resume and JD data
  const [editableResume, setEditableResume] = useState(null);
  const [editableJd, setEditableJd] = useState(null);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [jdSaved, setJdSaved] = useState(false);

  // Read-only Plan Sections state
  const [planSections, setPlanSections] = useState([]);

  // Fetch analysis data
  const fetchAnalysis = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.getAnalysis(id);
      setAnalysis(res);
      if (res.resume?.data) setEditableResume(res.resume.data);
      if (res.jd?.data) setEditableJd(res.jd.data);
      if (res.plan?.sections) {
        setPlanSections(res.plan.sections);
      } else if (res.plan?.items) {
        setPlanSections([]);
      }
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load interview analysis.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // Polling when extraction is running
  useEffect(() => {
    let timer;
    if (analysis?.analysisStatus === 'extracting') {
      timer = setInterval(() => {
        fetchAnalysis(true);
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [analysis?.analysisStatus, fetchAnalysis]);

  // Validate PDF file helper
  const validatePdf = (file) => {
    if (!file) return 'No file selected.';
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return 'Only PDF documents (.pdf) are permitted.';
    }
    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) {
      return 'File size exceeds the 10MB limit. Please upload a smaller PDF.';
    }
    return null;
  };

  // Upload Resume handler
  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validatePdf(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccessMsg('');
    setResumeUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.uploadResume(id, formData);
      setSuccessMsg('Resume PDF uploaded successfully.');
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Failed to upload resume.');
    } finally {
      setResumeUploading(false);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  // Upload JD handler
  const handleJdUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validatePdf(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccessMsg('');
    setJdUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.uploadJd(id, formData);
      setSuccessMsg('Job Description PDF uploaded successfully.');
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Failed to upload JD.');
    } finally {
      setJdUploading(false);
      if (jdInputRef.current) jdInputRef.current.value = '';
    }
  };

  // Trigger Extract Docs
  const handleExtract = async () => {
    setError('');
    setSuccessMsg('');
    setActionLoading('extract');

    try {
      await api.extractDocs(id);
      setSuccessMsg('Extraction completed successfully for Resume and JD.');
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Extraction failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Trigger Map Skills
  const handleMap = async () => {
    setError('');
    setSuccessMsg('');
    setActionLoading('map');

    try {
      await api.mapSkills(id);
      setSuccessMsg('Skill mapping generated successfully.');
      setActiveTab('mapping');
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Skill mapping failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Trigger Generate Plan
  const handlePlan = async () => {
    setError('');
    setSuccessMsg('');
    setActionLoading('plan');

    try {
      await api.generatePlan(id);
      setSuccessMsg('Interview plan generated successfully.');
      setActiveTab('plan');
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Plan generation failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Regenerate both Mapping & Plan after edits
  const handleRegenerate = async () => {
    setError('');
    setSuccessMsg('');
    setActionLoading('regenerate');

    try {
      await api.mapSkills(id);
      await api.generatePlan(id);
      setSuccessMsg('Mapping and Interview Plan regenerated successfully.');
      setActiveTab('plan');
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Regeneration failed.');
    } finally {
      setActionLoading('');
    }
  };

  // Save Recruiter corrections to Resume
  const handleSaveResumeEdits = async () => {
    if (!editableResume) return;
    setError('');
    setActionLoading('save_resume');

    try {
      await api.updateResumeData(id, editableResume);
      setResumeSaved(true);
      setSuccessMsg('Resume data changes saved. Click "Regenerate" to update mapping and plan.');
      setTimeout(() => setResumeSaved(false), 3000);
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Failed to save resume edits.');
    } finally {
      setActionLoading('');
    }
  };

  // Save Recruiter corrections to JD
  const handleSaveJdEdits = async () => {
    if (!editableJd) return;
    setError('');
    setActionLoading('save_jd');

    try {
      await api.updateJdData(id, editableJd);
      setJdSaved(true);
      setSuccessMsg('Job description changes saved. Click "Regenerate" to update mapping and plan.');
      setTimeout(() => setJdSaved(false), 3000);
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Failed to save JD edits.');
    } finally {
      setActionLoading('');
    }
  };

  // Recruiter override for Project Priority (PP)
  const handleProjectPriorityOverride = async (projectName, newPriority) => {
    try {
      setActionLoading(`override_${projectName}`);
      setError('');
      setSuccessMsg('');
      const res = await api.overrideProjectPriority(id, {
        projectName,
        priority: newPriority
      });
      setSuccessMsg(`Project priority for "${projectName}" updated to ${newPriority.toUpperCase()} by recruiter. Click "Regenerate" or "Generate Plan" to apply changes to interview plan order.`);
      await fetchAnalysis(true);
    } catch (err) {
      setError(err.message || 'Failed to update project priority.');
    } finally {
      setActionLoading('');
    }
  };


  const hasResume = !!analysis?.resume?.fileName;
  const hasJd = !!analysis?.jd?.fileName;
  const isExtracted = analysis?.resume?.status === 'extracted' && analysis?.jd?.status === 'extracted';
  const hasMapping = !!analysis?.mapping;
  const hasPlan = (planSections && planSections.length > 0) || (analysis?.plan?.sections && analysis.plan.sections.length > 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/recruiter')}
            className="p-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Back to Recruiter Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight m-0">
              Phase 2: Resume & JD Extraction & Interview Planning
            </h1>
            <p className="text-xs text-slate-400 m-0">Interview ID: {id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAnalysis(false)}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
            title="Refresh Analysis"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isExtracted && (
            <button
              onClick={handleRegenerate}
              disabled={!!actionLoading}
              className="py-1.5 px-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-violet-600/20 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Regenerate Mapping & Plan</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Stepper Progress */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-4 gap-2 text-xs font-semibold text-center">
          <div className={`p-2 rounded-xl border ${hasResume && hasJd ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800/40 border-slate-700 text-slate-500'}`}>
            1. Upload PDFs
          </div>
          <div className={`p-2 rounded-xl border ${isExtracted ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800/40 border-slate-700 text-slate-500'}`}>
            2. AI Extraction
          </div>
          <div className={`p-2 rounded-xl border ${hasMapping ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800/40 border-slate-700 text-slate-500'}`}>
            3. Skill Mapping
          </div>
          <div className={`p-2 rounded-xl border ${hasPlan ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-slate-800/40 border-slate-700 text-slate-500'}`}>
            4. Interview Plan
          </div>
        </div>

        {/* Section 1: Upload Dropzones */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Resume Dropzone */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <span>Candidate Resume PDF</span>
                </h3>
                {analysis?.resume?.editedByRecruiter && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                    Edited by Recruiter
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Upload the candidate's PDF resume (max 10MB). Text is extracted directly by Gemini.
              </p>

              {analysis?.resume?.fileName ? (
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-200 truncate m-0">
                        {analysis.resume.fileName}
                      </p>
                      <p className="text-[11px] text-slate-400 m-0">
                        Status: <span className="font-mono text-indigo-300">{analysis.resume.status}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <input
                ref={resumeInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleResumeUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => resumeInputRef.current?.click()}
                disabled={resumeUploading}
                className="w-full py-2.5 px-4 rounded-xl border border-dashed border-indigo-500/50 hover:border-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {resumeUploading ? (
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>{analysis?.resume?.fileName ? 'Replace Resume PDF' : 'Upload Resume PDF'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* JD Dropzone */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2 m-0">
                  <Briefcase className="w-5 h-5 text-indigo-400" />
                  <span>Job Description (JD) PDF</span>
                </h3>
                {analysis?.jd?.editedByRecruiter && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                    Edited by Recruiter
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Upload the target position JD PDF (max 10MB).
              </p>

              {analysis?.jd?.fileName ? (
                <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileCheck className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-200 truncate m-0">
                        {analysis.jd.fileName}
                      </p>
                      <p className="text-[11px] text-slate-400 m-0">
                        Status: <span className="font-mono text-indigo-300">{analysis.jd.status}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <input
                ref={jdInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleJdUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => jdInputRef.current?.click()}
                disabled={jdUploading}
                className="w-full py-2.5 px-4 rounded-xl border border-dashed border-indigo-500/50 hover:border-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {jdUploading ? (
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>{analysis?.jd?.fileName ? 'Replace JD PDF' : 'Upload JD PDF'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Action Toolbar */}
        <section className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleExtract}
              disabled={!hasResume || !hasJd || actionLoading === 'extract'}
              className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              {actionLoading === 'extract' ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Extract Resume & JD (Parallel)</span>
            </button>

            <button
              onClick={handleMap}
              disabled={!isExtracted || actionLoading === 'map'}
              className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              {actionLoading === 'map' ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Layers className="w-4 h-4 text-indigo-400" />
              )}
              <span>Map Competencies</span>
            </button>

            <button
              onClick={handlePlan}
              disabled={!hasMapping || actionLoading === 'plan'}
              className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            >
              {actionLoading === 'plan' ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ListOrdered className="w-4 h-4" />
              )}
              <span>Generate Interview Plan</span>
            </button>
          </div>

          <div className="text-xs text-slate-400">
            Pipeline Status: <span className="font-mono text-indigo-300 font-semibold">{analysis?.analysisStatus || 'none'}</span>
          </div>
        </section>

        {/* Section 2: Review Screen Tabs */}
        <section className="space-y-4">
          {/* Tab Navigation */}
          <div className="border-b border-slate-800 flex gap-2">
            <button
              onClick={() => setActiveTab('resume')}
              className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'resume'
                  ? 'border-indigo-500 text-white bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Resume Data</span>
              {analysis?.resume?.editedByRecruiter && (
                <span className="w-2 h-2 rounded-full bg-violet-400" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('jd')}
              className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'jd'
                  ? 'border-indigo-500 text-white bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>JD Requirements</span>
              {analysis?.jd?.editedByRecruiter && (
                <span className="w-2 h-2 rounded-full bg-violet-400" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('mapping')}
              className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'mapping'
                  ? 'border-indigo-500 text-white bg-indigo-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Skill Mapping</span>
              {hasMapping && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {analysis?.mapping?.matchedSkills?.length || 0}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('plan')}
              className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'plan'
                  ? 'border-emerald-500 text-white bg-emerald-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>Interview Plan</span>
              {hasPlan && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  {planSections.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: RESUME DATA REVIEW & EDIT */}
          {activeTab === 'resume' && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              {!editableResume ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No resume data extracted yet. Upload a resume and click "Extract Resume & JD".
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <h4 className="text-sm font-bold text-white m-0">Candidate Profile & Skills</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Extracted directly from PDF. You can edit any field below.
                      </p>
                    </div>

                    <button
                      onClick={handleSaveResumeEdits}
                      disabled={actionLoading === 'save_resume'}
                      className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{resumeSaved ? 'Saved ✓' : 'Save Resume Edits'}</span>
                    </button>
                  </div>

                  {/* Candidate Contact */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Name</label>
                      <input
                        type="text"
                        value={editableResume.candidate?.name || ''}
                        onChange={(e) => setEditableResume({ ...editableResume, candidate: { ...editableResume.candidate, name: e.target.value } })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Email</label>
                      <input
                        type="text"
                        value={editableResume.candidate?.email || ''}
                        onChange={(e) => setEditableResume({ ...editableResume, candidate: { ...editableResume.candidate, email: e.target.value } })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Phone</label>
                      <input
                        type="text"
                        value={editableResume.candidate?.phone || ''}
                        onChange={(e) => setEditableResume({ ...editableResume, candidate: { ...editableResume.candidate, phone: e.target.value } })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Location</label>
                      <input
                        type="text"
                        value={editableResume.candidate?.location || ''}
                        onChange={(e) => setEditableResume({ ...editableResume, candidate: { ...editableResume.candidate, location: e.target.value } })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100"
                      />
                    </div>
                  </div>

                  {/* Skills Tag Field */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Extracted Skills ({editableResume.skills?.length || 0})
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {editableResume.skills?.map((s, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                          {typeof s === 'string' ? s : s.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Projects */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Projects ({editableResume.projects?.length || 0})
                    </label>
                    <div className="space-y-3">
                      {editableResume.projects?.map((proj, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 space-y-1.5">
                          <p className="text-xs font-bold text-white m-0">{proj.name}</p>
                          <p className="text-xs text-slate-400 m-0">{proj.description}</p>
                          {proj.technologies?.length > 0 && (
                            <p className="text-[11px] text-indigo-400 m-0">
                              Tech: {proj.technologies.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Claims */}
                  {editableResume.claims?.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Key Metrics, Major Project Claims & Achievements ({editableResume.claims.length})</span>
                      </label>
                      <div className="space-y-2">
                        {editableResume.claims.map((claim, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200 flex flex-col gap-2">
                            <p className="m-0 leading-relaxed text-slate-100 font-medium">"{claim.text}"</p>
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              {claim.relatedProject && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-semibold">
                                  📁 {claim.relatedProject}
                                </span>
                              )}
                              {claim.relatedSkill && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold">
                                  ⚡ {claim.relatedSkill}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: JD REQUIREMENTS REVIEW & EDIT */}
          {activeTab === 'jd' && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              {!editableJd ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No Job Description data extracted yet. Upload a JD and click "Extract Resume & JD".
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <h4 className="text-sm font-bold text-white m-0">Job Description Requirements</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Extracted directly from JD PDF. You can edit any requirement below.
                      </p>
                    </div>

                    <button
                      onClick={handleSaveJdEdits}
                      disabled={actionLoading === 'save_jd'}
                      className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{jdSaved ? 'Saved ✓' : 'Save JD Edits'}</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={editableJd.job_title || ''}
                      onChange={(e) => setEditableJd({ ...editableJd, job_title: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                      Required Skills ({editableJd.required_skills?.length || 0})
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {editableJd.required_skills?.map((sk, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-teal-400 uppercase tracking-wider mb-2">
                      Preferred / Nice-to-Have Skills ({editableJd.preferred_skills?.length || 0})
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {editableJd.preferred_skills?.map((sk, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Key Responsibilities ({editableJd.responsibilities?.length || 0})
                    </label>
                    <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                      {editableJd.responsibilities?.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Experience Requirements
                    </label>
                    <p className="text-xs text-slate-300 bg-slate-800/40 p-3 rounded-xl border border-slate-800 m-0">
                      {editableJd.experience_requirements || 'Not specified'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SKILL MAPPING */}
          {activeTab === 'mapping' && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              {!analysis?.mapping ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  Skill mapping not generated yet. Click "Map Competencies" above.
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-white m-0">Competency Comparison & Skill Gap Analysis</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Evaluated against the Job Description requirements.
                    </p>
                  </div>

                  {/* 3 Skill Groups */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Matched */}
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Matched Skills</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                          {analysis.mapping.matchedSkills?.length || 0}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {analysis.mapping.matchedSkills?.map((s, idx) => (
                          <span key={idx} className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                            ✓ {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Partial */}
                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Partial Skills</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                          {analysis.mapping.partialSkills?.length || 0}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {analysis.mapping.partialSkills?.map((s, idx) => (
                          <span key={idx} className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
                            ~ {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing */}
                    <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Missing Skills</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                          {analysis.mapping.missingSkills?.length || 0}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {analysis.mapping.missingSkills?.map((s, idx) => (
                          <span key={idx} className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                            ✗ {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Verification Priorities */}
                  {analysis.mapping.verificationPriorities?.length > 0 && (
                    <div className="pt-2 space-y-3">
                      <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 m-0">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span>Verification Priorities ({analysis.mapping.verificationPriorities.length})</span>
                      </h5>
                      <div className="grid grid-cols-1 gap-2.5">
                        {analysis.mapping.verificationPriorities.map((vp, idx) => (
                          <div key={idx} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-start justify-between gap-4 text-xs">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-200 m-0">{vp.item}</p>
                              <p className="text-slate-400 m-0">{vp.reason}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                              vp.priority === 'high'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : vp.priority === 'medium'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-700 text-slate-300'
                            }`}>
                              {vp.priority} priority
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PROJECT PRIORITY (PP) SECTION */}
                  <div className="pt-4 border-t border-slate-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-white m-0 flex items-center gap-2">
                          <FolderGit2 className="w-4 h-4 text-indigo-400" />
                          <span>Project Priority (PP)</span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Candidate projects ordered high → medium → low based on JD skill alignment (high=3, medium=2, low=1). Recruiter overrides persist across plan generation.
                        </p>
                      </div>

                      <span className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-medium shrink-0">
                        {analysis.mapping.projectPriorities?.length || 0} Project{analysis.mapping.projectPriorities?.length === 1 ? '' : 's'} Evaluated
                      </span>
                    </div>

                    {(!analysis.mapping.projectPriorities || analysis.mapping.projectPriorities.length === 0) ? (
                      <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400 text-center">
                        No projects mapped yet. Re-run "Map Competencies" to compute project priorities.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {analysis.mapping.projectPriorities.map((pp, idx) => {
                          const priorityColor = {
                            high: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                            medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                            low: 'bg-slate-700/60 text-slate-300 border-slate-600'
                          }[pp.priority] || 'bg-slate-800 text-slate-300';

                          return (
                            <div
                              key={idx}
                              className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-3 transition-colors hover:border-slate-600"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/50 pb-2.5">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <h5 className="text-sm font-bold text-white m-0 flex items-center gap-2">
                                    <FolderGit2 className="w-4 h-4 text-indigo-400" />
                                    <span>{pp.projectName}</span>
                                  </h5>

                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${priorityColor}`}>
                                    {pp.priority} Priority
                                  </span>

                                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                                    Score: {pp.score}
                                  </span>

                                  {pp.editedByRecruiter && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                                      ✏️ Recruiter Override
                                    </span>
                                  )}
                                </div>

                                {/* Recruiter Override Dropdown */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-slate-400 font-medium">Override PP:</span>
                                  <select
                                    value={pp.priority}
                                    onChange={(e) => handleProjectPriorityOverride(pp.projectName, e.target.value)}
                                    disabled={actionLoading === `override_${pp.projectName}`}
                                    className="px-2.5 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-white font-medium focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                                  >
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                  </select>
                                </div>
                              </div>

                              {/* Matched JD Skills with JP badges */}
                              <div>
                                <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                                  Matched JD Skills ({pp.matchedJdSkills?.length || 0}):
                                </span>
                                {(!pp.matchedJdSkills || pp.matchedJdSkills.length === 0) ? (
                                  <p className="text-xs text-slate-500 italic m-0">
                                    No direct JD skill match detected (Priority defaults to Low).
                                  </p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {pp.matchedJdSkills.map((ms, msIdx) => {
                                      const jpColor = {
                                        high: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
                                        medium: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
                                        low: 'bg-slate-700/60 text-slate-400 border-slate-600'
                                      }[ms.jdPriority] || 'bg-slate-800 text-slate-300';

                                      return (
                                        <span
                                          key={msIdx}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200"
                                        >
                                          <span className="font-medium">{ms.skill}</span>
                                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border ${jpColor}`}>
                                            JP: {ms.jdPriority}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Reason */}
                              {pp.reason && (
                                <p className="text-xs text-slate-400 m-0 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                                  <span className="font-semibold text-slate-300">Analysis: </span>
                                  {pp.reason}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: READ-ONLY INTERVIEW PLAN */}
          {activeTab === 'plan' && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              {!hasPlan ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  Interview plan has not been generated yet. Click "Generate Interview Plan" above.
                </div>
              ) : (
                <div className="space-y-4">
                  {planSections.map((section, secIdx) => {
                    const priorityColor = {
                      high: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                      medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                      low: 'bg-slate-700/60 text-slate-300 border-slate-600'
                    }[section.projectPriority] || 'bg-slate-800 text-slate-300';

                    // Prepare groups for display
                    let groupsToRender = [];
                    if (section.type === 'project') {
                      // Project sections always show exactly these 3 groups in order, even when empty
                      const claimsGroup = (section.groups || []).find((g) =>
                        g.name.toLowerCase().includes('claim')
                      ) || {
                        name: 'Resume claims',
                        topics: section.resumeClaims || []
                      };
                      const highGroup = (section.groups || []).find((g) =>
                        g.name.toLowerCase().includes('high')
                      ) || {
                        name: 'High-priority JD skills matched to this project',
                        topics: []
                      };
                      const medGroup = (section.groups || []).find((g) =>
                        g.name.toLowerCase().includes('medium')
                      ) || {
                        name: 'Medium-priority JD skills matched to this project',
                        topics: []
                      };

                      groupsToRender = [
                        { name: 'Resume claims', isClaims: true, topics: claimsGroup.topics || [] },
                        { name: 'High-priority JD skills matched to this project', isClaims: false, topics: highGroup.topics || [] },
                        { name: 'Medium-priority JD skills matched to this project', isClaims: false, topics: medGroup.topics || [] }
                      ];
                    } else {
                      // Other sections (intro, remaining requirements): omit empty groups
                      groupsToRender = (section.groups || [])
                        .filter((g) => Array.isArray(g.topics) && g.topics.length > 0)
                        .map((g) => ({
                          name: g.name,
                          isClaims: g.name.toLowerCase().includes('claim'),
                          topics: g.topics || []
                        }));
                    }

                    return (
                      <div
                        key={secIdx}
                        className="rounded-2xl bg-slate-800/60 border border-slate-700/80 overflow-hidden shadow-sm"
                      >
                        {/* Section Card Header: Title + Project Priority Badge */}
                        <div className="px-5 py-3.5 bg-slate-850/80 flex items-center justify-between border-b border-slate-700/40">
                          <h5 className="text-sm font-bold text-white m-0">{section.title}</h5>
                          {section.type === 'project' && section.projectPriority && (
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${priorityColor}`}>
                              {section.projectPriority} Priority
                            </span>
                          )}
                        </div>

                        {/* Section Groups */}
                        <div className="p-5 space-y-4">
                          {groupsToRender.map((group, grpIdx) => (
                            <div key={grpIdx} className="space-y-1.5">
                              <h6 className="text-xs font-semibold text-slate-300 m-0">{group.name}</h6>
                              {(!group.topics || group.topics.length === 0) ? (
                                <p className="text-xs text-slate-500 italic m-0">None</p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {group.topics.map((item, itemIdx) => (
                                    <span
                                      key={itemIdx}
                                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium border select-none ${
                                        group.isClaims
                                          ? 'bg-violet-950/40 text-violet-300 border-violet-500/30'
                                          : 'bg-slate-800 text-slate-200 border-slate-700/60'
                                      }`}
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default InterviewDetailPage;
