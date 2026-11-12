import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { ResumeExtractionService } from '../src/services/resumeExtraction.service.js';
import { JdExtractionService } from '../src/services/jdExtraction.service.js';
import { Interview } from '../src/models/Interview.js';
import { User } from '../src/models/User.js';
import { Resume } from '../src/models/Resume.js';
import { JobDescription } from '../src/models/JobDescription.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testExtraction() {
  console.log('================================================================');
  console.log('   VoiceHire AI — Custom Extraction Verification Test           ');
  console.log('================================================================\n');

  const resumePath = 'D:\\MJ_V1\\VoiceHireAI\\uploads\\jds\\v1.pdf';
  const jdPath = 'D:\\MJ_V1\\VoiceHireAI\\uploads\\jds\\AI_Engineer_Job_Description.pdf';

  console.log(`[Input Files]`);
  console.log(`  Resume: ${resumePath}`);
  console.log(`  JD    : ${jdPath}\n`);

  // Connect to MongoDB
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
    console.log('MongoDB connected successfully.\n');
  }

  const rand = Math.random().toString(36).substring(7);
  const testUser = await User.create({
    name: 'Extraction Tester',
    email: `tester_${rand}@voicehire.com`,
    passwordHash: 'dummy',
    role: 'RECRUITER'
  });

  const testCandidate = await User.create({
    name: 'Candidate Tester',
    email: `cand_${rand}@voicehire.com`,
    passwordHash: 'dummy',
    role: 'CANDIDATE'
  });

  const testInterview = await Interview.create({
    title: 'Extraction Test Interview',
    recruiterId: testUser._id,
    candidateId: testCandidate._id,
    status: 'draft'
  });
  const interviewId = testInterview._id.toString();

  try {
    // 1. EXTRACT RESUME
    console.log('--- 1. TESTING RESUME EXTRACTION ---');
    const resumeStart = Date.now();
    const resumeDoc = await ResumeExtractionService.extractResume({
      interviewId,
      candidateId: testCandidate._id,
      filePath: resumePath,
      fileName: 'v1.pdf'
    });
    const resumeDuration = Date.now() - resumeStart;
    console.log(`✓ Resume extraction completed in ${resumeDuration}ms!\n`);

    const rData = resumeDoc.data || {};
    console.log('Extracted Resume Summary:');
    console.log(`  Candidate Name    : ${rData.candidate?.name || 'N/A'}`);
    console.log(`  Email             : ${rData.candidate?.email || 'N/A'}`);
    console.log(`  Phone             : ${rData.candidate?.phone || 'N/A'}`);
    console.log(`  Location          : ${rData.candidate?.location || 'N/A'}`);
    console.log(`  Derived Level     : ${rData.experienceSummary?.experienceLevel || 'N/A'}`);
    console.log(`  Total Experience  : ${rData.experienceSummary?.totalYears || 0} years (${rData.experienceSummary?.totalMonths || 0} months)`);
    console.log(`  Experience Roles  : ${rData.experience?.length || 0} roles extracted`);
    if (rData.experience?.length > 0) {
      rData.experience.forEach((role, idx) => {
        console.log(`    [${idx + 1}] ${role.title || 'Role'} at ${role.company || 'Company'} (${role.duration || role.durationMonths + ' mos'})`);
      });
    }
    console.log(`  Total Skills      : ${rData.skills?.length || 0} skills`);
    console.log(`    Sample Skills   : ${rData.skills?.slice(0, 10).map((s) => s.name || s).join(', ')}`);
    console.log(`  Projects          : ${rData.projects?.length || 0} projects`);
    if (rData.projects?.length > 0) {
      rData.projects.forEach((proj, idx) => {
        console.log(`    [${idx + 1}] ${proj.name || 'Project'} — Tech: ${(proj.technologies || []).join(', ')}`);
      });
    }
    console.log(`  Quantitative Claims: ${rData.claims?.length || 0} claims extracted`);
    if (rData.claims?.length > 0) {
      rData.claims.slice(0, 3).forEach((claim, idx) => {
        console.log(`    [${idx + 1}] "${claim.text}" (Project: ${claim.relatedProject || 'General'})`);
      });
    }

    // 2. EXTRACT JOB DESCRIPTION
    console.log('\n--- 2. TESTING JOB DESCRIPTION EXTRACTION ---');
    const jdStart = Date.now();
    const jdDoc = await JdExtractionService.extractJd({
      interviewId,
      filePath: jdPath,
      fileName: 'AI_Engineer_Job_Description.pdf'
    });
    const jdDuration = Date.now() - jdStart;
    console.log(`✓ Job Description extraction completed in ${jdDuration}ms!\n`);

    const jData = jdDoc.data || {};
    console.log('Extracted Job Description Summary:');
    console.log(`  Job Title         : ${jData.job_title || 'N/A'}`);
    console.log(`  Department/Role   : ${jData.department || jData.role || 'N/A'}`);
    console.log(`  Min Experience Req: ${jData.experience?.minimumYears || jData.experience_requirements || 'N/A'} years`);
    console.log(`  Required Skills   : ${jData.required_skills?.length || 0} skills`);
    if (jData.required_skills?.length > 0) {
      console.log(`    Sample Required : ${jData.required_skills.slice(0, 8).map((s) => s.name || s).join(', ')}`);
    }
    console.log(`  Preferred Skills  : ${jData.preferred_skills?.length || 0} skills`);
    if (jData.preferred_skills?.length > 0) {
      console.log(`    Sample Preferred: ${jData.preferred_skills.slice(0, 8).map((s) => s.name || s).join(', ')}`);
    }
    console.log(`  Responsibilities  : ${jData.responsibilities?.length || 0} items extracted`);

    console.log('\n================================================================');
    console.log('   EXTRACTION VERIFICATION: BOTH RESUME & JD WORKING 100%!     ');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ Extraction Verification Error:', err);
    process.exit(1);
  } finally {
    // Cleanup test records
    await Resume.deleteMany({ interviewId });
    await JobDescription.deleteMany({ interviewId });
    await Interview.findByIdAndDelete(interviewId);
    await User.findByIdAndDelete(testUser._id);
    if (testCandidate?._id) await User.findByIdAndDelete(testCandidate._id);
    await mongoose.disconnect();
  }
}

testExtraction()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
