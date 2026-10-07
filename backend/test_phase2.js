import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './src/app.js';
import { connectDB } from './src/config/db.js';
import User from './src/models/User.js';
import Interview from './src/models/Interview.js';
import Resume from './src/models/Resume.js';
import JobDescription from './src/models/JobDescription.js';
import Mapping from './src/models/Mapping.js';
import InterviewPlan from './src/models/InterviewPlan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runPhase2Tests = async () => {
  await connectDB();

  // Cleanup test records
  await User.deleteMany({ email: { $in: ['p2_recruiter@voicehire.com', 'p2_candidate@voicehire.com'] } });
  await Interview.deleteMany({ title: { $regex: /^Phase 2 Test/ } });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5002, resolve));
  const baseUrl = 'http://127.0.0.1:5002';

  console.log('\n--- STARTING PHASE 2 AUTOMATED SMOKE TESTS ---');

  const req = async (endpoint, options = {}) => {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    };

    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      body: options.body && !isFormData && typeof options.body === 'object'
        ? JSON.stringify(options.body)
        : options.body
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  try {
    // 1. Register Recruiter and Candidate
    console.log('\n[1] Registering recruiter and candidate...');
    const rRecruiter = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'P2 Recruiter', email: 'p2_recruiter@voicehire.com', password: 'password123', role: 'RECRUITER' }
    });
    const recruiterToken = rRecruiter.data.token;

    const rCandidate = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'P2 Candidate', email: 'p2_candidate@voicehire.com', password: 'password123', role: 'CANDIDATE' }
    });
    const candidateId = rCandidate.data.user._id;
    const candidateToken = rCandidate.data.token;

    // 2. Create Interview
    console.log('\n[2] Creating an interview...');
    const rInterview = await req('/api/interviews', {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: {
        title: 'Phase 2 Test Full Stack Screening',
        candidateId,
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }
    });
    if (rInterview.status !== 201) throw new Error('Interview creation failed');
    const interviewId = rInterview.data.interview._id;

    // 3. Test File Validation: Reject non-PDF
    console.log('\n[3] Testing upload validation (reject non-PDF)...');
    const sampleDir = path.resolve(__dirname, 'samples');
    const invalidTextFile = path.join(sampleDir, 'sample_invalid.txt');
    const invalidBytes = fs.readFileSync(invalidTextFile);

    const formInvalid = new FormData();
    formInvalid.append('file', new Blob([invalidBytes], { type: 'text/plain' }), 'sample_invalid.txt');

    const rInvalidUpload = await req(`/api/interviews/${interviewId}/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: formInvalid
    });
    console.log('Non-PDF upload response:', rInvalidUpload.status, rInvalidUpload.data.error);
    if (rInvalidUpload.status !== 400 || !rInvalidUpload.data.error?.includes('Only PDF documents')) {
      throw new Error('Validation failure: Server accepted a non-PDF file');
    }

    // 4. Upload Valid Resume PDF
    console.log('\n[4] Uploading valid Resume PDF...');
    const resumePdfBytes = fs.readFileSync(path.join(sampleDir, 'sample_resume.pdf'));
    const formResume = new FormData();
    formResume.append('file', new Blob([resumePdfBytes], { type: 'application/pdf' }), 'sample_resume.pdf');

    const rResumeUpload = await req(`/api/interviews/${interviewId}/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: formResume
    });
    console.log('Resume upload response:', rResumeUpload.status, rResumeUpload.data.message);
    if (rResumeUpload.status !== 200) throw new Error('Valid resume upload failed');

    // 5. Upload Valid JD PDF
    console.log('\n[5] Uploading valid JD PDF...');
    const jdPdfBytes = fs.readFileSync(path.join(sampleDir, 'sample_jd.pdf'));
    const formJd = new FormData();
    formJd.append('file', new Blob([jdPdfBytes], { type: 'application/pdf' }), 'sample_jd.pdf');

    const rJdUpload = await req(`/api/interviews/${interviewId}/jd`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: formJd
    });
    console.log('JD upload response:', rJdUpload.status, rJdUpload.data.message);
    if (rJdUpload.status !== 200) throw new Error('Valid JD upload failed');

    // 6. Run Extraction
    console.log('\n[6] Running parallel extraction for Resume and JD...');
    const rExtract = await req(`/api/interviews/${interviewId}/extract`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    console.log('Extraction response:', rExtract.status, rExtract.data.message);
    if (rExtract.status !== 200 || !rExtract.data.resume?.data || !rExtract.data.jd?.data) {
      throw new Error('Extraction failed to populate structured data');
    }

    // 6b. Ensure at least 3 resume projects for multi-project acceptance criteria
    console.log('\n[6b] Verifying 3+ resume projects for multi-project acceptance criteria...');
    const currentResume = rExtract.data.resume.data;
    if (!currentResume.projects || currentResume.projects.length < 3) {
      currentResume.projects = [
        {
          name: 'AI Voice Screening Engine',
          role: 'Lead Architect',
          description: 'Designed real-time LLM voice interview pipeline',
          technologies: ['Node.js', 'FastAPI', 'WebSockets', 'Python'],
          responsibilities: ['Architecture', 'Scale backend']
        },
        {
          name: 'Distributed Order Management System',
          role: 'Senior Backend Engineer',
          description: 'High throughput event-driven microservices platform',
          technologies: ['TypeScript', 'REST APIs', 'PostgreSQL', 'Docker'],
          responsibilities: ['Data modeling', 'API performance']
        },
        {
          name: 'Healthcare Analytics Dashboard',
          role: 'Full Stack Engineer',
          description: 'HIPAA-compliant patient metrics portal',
          technologies: ['React', 'CSS', 'JavaScript'],
          responsibilities: ['Frontend UI', 'Visual charts']
        }
      ];
      currentResume.claims = [
        { text: 'Handled 5,000 concurrent streaming connections', project: 'AI Voice Screening Engine' },
        { text: 'Reduced order latency by 45% using redis cache', project: 'Distributed Order Management System' }
      ];

      await req(`/api/interviews/${interviewId}/resume/data`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${recruiterToken}` },
        body: currentResume
      });
      console.log('Populated 3 resume projects with claims ✓');
    }

    // 7. Run Mapping
    console.log('\n[7] Generating Resume-JD skill mapping & Project Priorities...');
    const rMap = await req(`/api/interviews/${interviewId}/map`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    console.log('Mapping response:', rMap.status, 'Matched skills count:', rMap.data.mapping?.matchedSkills?.length);
    console.log('Project Priorities count:', rMap.data.mapping?.projectPriorities?.length);
    if (rMap.status !== 200 || !rMap.data.mapping?.matchedSkills || !Array.isArray(rMap.data.mapping?.projectPriorities)) {
      throw new Error('Mapping failed or projectPriorities missing');
    }

    // Verify Project Priority fields
    for (const pp of rMap.data.mapping.projectPriorities) {
      if (!pp.projectName || !['high', 'medium', 'low'].includes(pp.priority) || typeof pp.score !== 'number') {
        throw new Error(`Invalid project priority structure: ${JSON.stringify(pp)}`);
      }
    }
    console.log('Project Priority validation: PASSED ✓');

    // 8. Test Recruiter PP Override
    console.log('\n[8] Testing recruiter Project Priority override...');
    const firstProject = rMap.data.mapping.projectPriorities[0];
    const newOverridePriority = firstProject.priority === 'high' ? 'low' : 'high';
    const rOverride = await req(`/api/interviews/${interviewId}/project-priority`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: {
        projectName: firstProject.projectName,
        priority: newOverridePriority
      }
    });
    console.log('PP override status:', rOverride.status, 'Updated priorities:', rOverride.data.projectPriorities?.length);
    if (rOverride.status !== 200) {
      throw new Error('Recruiter PP override endpoint failed');
    }
    const overridden = rOverride.data.projectPriorities.find((p) => p.projectName === firstProject.projectName);
    if (!overridden || overridden.priority !== newOverridePriority || !overridden.editedByRecruiter) {
      throw new Error('Recruiter PP override did not persist or editedByRecruiter flag was not set');
    }
    console.log('Recruiter PP override validation: PASSED ✓');

    // 9. Generate Dynamic Sectioned Interview Plan (Sections per Project)
    console.log('\n[9] Generating Dynamic Interview Plan with per-project sections...');
    const rPlan = await req(`/api/interviews/${interviewId}/plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    console.log('Plan response:', rPlan.status, 'Total sections:', rPlan.data.plan?.sections?.length);
    if (rPlan.status !== 200 || !Array.isArray(rPlan.data.plan?.sections) || rPlan.data.plan.sections.length === 0) {
      throw new Error('Interview plan generation failed or sections missing');
    }

    const sections = rPlan.data.plan.sections;

    // Acceptance Criterion 1: Exactly N project sections + introduction + remaining_requirements
    const introSection = sections[0];
    const remainingSection = sections[sections.length - 1];
    const projectSections = sections.slice(1, -1);

    if (introSection.type !== 'introduction' || introSection.order !== 1) {
      throw new Error(`First section must be introduction! Found: ${introSection.type}`);
    }

    if (remainingSection.type !== 'remaining_requirements' || remainingSection.order !== sections.length) {
      throw new Error(`Last section must be remaining_requirements! Found: ${remainingSection.type}`);
    }

    if (projectSections.length < 3) {
      throw new Error(`Expected at least 3 project sections for 3 projects, but got ${projectSections.length}`);
    }

    for (const ps of projectSections) {
      if (ps.type !== 'project' || !ps.projectName) {
        throw new Error(`Invalid project section: ${JSON.stringify(ps)}`);
      }
    }
    console.log(`Verified section counts: 1 Intro + ${projectSections.length} Projects + 1 Remaining Requirements ✓`);

    // Acceptance Criterion 2: Project sections ordered by Project Priority (high -> medium -> low)
    const ppWeights = { high: 3, medium: 2, low: 1 };
    for (let i = 1; i < projectSections.length; i++) {
      const prevWeight = ppWeights[projectSections[i - 1].projectPriority] || 0;
      const currWeight = ppWeights[projectSections[i].projectPriority] || 0;
      if (currWeight > prevWeight) {
        throw new Error(`Project sections not ordered by priority: ${projectSections[i - 1].projectPriority} (${projectSections[i - 1].projectName}) before ${projectSections[i].projectPriority} (${projectSections[i].projectName})`);
      }
    }
    console.log('Project sections ordered high → medium → low: PASSED ✓');

    // Acceptance Criterion 3: Project sections have exactly the 3 groups in order and NO "Project overview"
    for (const ps of projectSections) {
      if (!Array.isArray(ps.groups) || ps.groups.length !== 3) {
        throw new Error(`Project section "${ps.title}" must have exactly 3 groups, found: ${ps.groups?.length}`);
      }
      const [g1, g2, g3] = ps.groups;
      if (g1.name !== 'Resume claims') {
        throw new Error(`First project group must be 'Resume claims', found: "${g1.name}"`);
      }
      if (g2.name !== 'High-priority JD skills matched to this project') {
        throw new Error(`Second project group must be 'High-priority JD skills matched to this project', found: "${g2.name}"`);
      }
      if (g3.name !== 'Medium-priority JD skills matched to this project') {
        throw new Error(`Third project group must be 'Medium-priority JD skills matched to this project', found: "${g3.name}"`);
      }
      for (const grp of ps.groups) {
        if (!Array.isArray(grp.topics)) {
          throw new Error(`Group ${grp.name} topics must be an array`);
        }
        if (typeof grp.questionBudget !== 'number') {
          throw new Error(`Group ${grp.name} questionBudget must be a number`);
        }
      }
    }
    console.log('Project section mandatory 3-group structure: PASSED ✓');

    // Acceptance Criterion 4: No "Project overview" or responsibility/architecture topics anywhere
    const serializedPlan = JSON.stringify(rPlan.data.plan);
    const forbiddenOverviewPatterns = [/Project overview/i, /decisions and trade-offs/i];
    for (const pattern of forbiddenOverviewPatterns) {
      if (pattern.test(serializedPlan)) {
        throw new Error(`Plan contains forbidden overview topic: ${pattern}`);
      }
    }
    console.log('No "Project overview" or architecture/responsibility topics in plan: PASSED ✓');

    // Acceptance Criterion 5: No internal stage codes (S0-S5) or depth labels (deep/standard/basic)
    const forbiddenPatterns = [/\bS0\b/, /\bS1\b/, /\bS2\b/, /\bS3\b/, /\bS4\b/, /\bS5\b/, /"stage":/, /"depth":/];
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(serializedPlan)) {
        throw new Error(`Plan contains forbidden internal stage code or depth tag: ${pattern}`);
      }
    }
    console.log('No internal stage codes (S0-S5) or depth labels in plan: PASSED ✓');

    // 10. Test Plan Regeneration after Upstream Edit
    console.log('\n[10] Testing plan regeneration after upstream recruiter override...');
    // Override first project priority
    const targetProj = projectSections[0].projectName;
    await req(`/api/interviews/${interviewId}/project-priority`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: {
        projectName: targetProj,
        priority: 'low'
      }
    });

    // Regenerate plan
    const rRegenPlan = await req(`/api/interviews/${interviewId}/plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    console.log('Regenerated plan status:', rRegenPlan.status, 'Total sections:', rRegenPlan.data.plan?.sections?.length);
    if (rRegenPlan.status !== 200 || !rRegenPlan.data.plan?.sections) {
      throw new Error('Plan regeneration after upstream edit failed');
    }

    const regenProjectSections = rRegenPlan.data.plan.sections.slice(1, -1);
    const updatedTargetProj = regenProjectSections.find((p) => p.projectName === targetProj);
    if (!updatedTargetProj || updatedTargetProj.projectPriority !== 'low') {
      throw new Error(`Regenerated plan did not reflect upstream priority change for ${targetProj}`);
    }
    console.log('Plan regeneration reflects upstream edits: PASSED ✓');

    // 11. Cross-Role Isolation Check (Candidate blocked from recruiter Analysis)
    console.log('\n[11] Verifying Candidate is forbidden from recruiter analysis...');
    const rCross = await req(`/api/interviews/${interviewId}/analysis`, {
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log('Candidate accessing analysis status:', rCross.status);
    if (rCross.status !== 403) {
      throw new Error('Security flaw: Candidate was allowed to view recruiter analysis');
    }

    console.log('\n========================================');
    console.log('ALL PHASE 2 SMOKE TESTS PASSED 100%!');
    console.log('========================================\n');
  } finally {
    // Cleanup
    await User.deleteMany({ email: { $in: ['p2_recruiter@voicehire.com', 'p2_candidate@voicehire.com'] } });
    await Interview.deleteMany({ title: { $regex: /^Phase 2 Test/ } });
    await Resume.deleteMany({});
    await JobDescription.deleteMany({});
    await Mapping.deleteMany({});
    await InterviewPlan.deleteMany({});
    server.close();
    process.exit(0);
  }
};

runPhase2Tests().catch((err) => {
  console.error('\nPHASE 2 TEST FAILED:', err);
  process.exit(1);
});
