import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis.js';
import { Interview } from '../models/Interview.js';
import { Resume } from '../models/Resume.js';
import { JobDescription } from '../models/JobDescription.js';
import { Mapping } from '../models/Mapping.js';
import { InterviewPlan } from '../models/InterviewPlan.js';
import { InterviewTurn } from '../models/InterviewTurn.js';
import {
  redisActiveStateSchema,
  normalizePriority,
  questionSchema,
  answerSchema,
  evidenceSchema,
  redisCandidateExperienceSchema
} from '../schemas/redis.schema.js';

export class MissingInterviewDataError extends Error {
  constructor(missingEntity) {
    super(`Missing required entity to initialize interview state: ${missingEntity}`);
    this.name = 'MissingInterviewDataError';
    this.statusCode = 400;
  }
}

export class EmptyInterviewPlanError extends Error {
  constructor(message) {
    super(message || 'Interview plan has 0 sections');
    this.name = 'EmptyInterviewPlanError';
    this.statusCode = 400;
  }
}

const STATE_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const LOCK_TIMEOUT_MS = 30000; // 30 seconds

export class RedisStateManager {
  static getStateKey(interviewId) {
    return `interview:state:${String(interviewId)}`;
  }

  static getLockKey(interviewId) {
    return `interview:lock:${String(interviewId)}`;
  }

  /**
   * Acquire a distributed lock for single-flight turn processing
   */
  static async acquireLock(interviewId, timeoutMs = LOCK_TIMEOUT_MS) {
    const redis = getRedisClient();
    const lockKey = this.getLockKey(interviewId);
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const acquired = await redis.set(lockKey, token, 'PX', timeoutMs, 'NX');
    if (acquired) return token;

    // Retry loop up to 3000ms
    const start = Date.now();
    while (Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 60));
      const retry = await redis.set(lockKey, token, 'PX', timeoutMs, 'NX');
      if (retry) return token;
    }

    throw new Error(`[RedisState] Could not acquire lock for interview ${interviewId} within timeout`);
  }

  /**
   * Safe release of distributed lock via Lua script
   */
  static async releaseLock(interviewId, token) {
    const redis = getRedisClient();
    const lockKey = this.getLockKey(interviewId);
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await redis.eval(luaScript, 1, lockKey, token);
    } catch (err) {
      console.warn(`[RedisState] Lock release warning for ${interviewId}: ${err.message}`);
    }
  }

  /**
   * Format resume experience for candidate_context
   */
  static formatExperience(resumeData) {
    const summary = resumeData?.experienceSummary || {};
    const rawRoles = Array.isArray(resumeData?.experience) ? resumeData.experience : [];

    const companies = rawRoles.map((r) => ({
      company: r.company || '',
      years: typeof r.years === 'number' ? r.years : 0
    }));

    return redisCandidateExperienceSchema.parse({
      experienceLevel: summary.experienceLevel || '',
      totalYears: summary.totalYears || 0,
      companies
    });
  }

  /**
   * Initialize live interview state from MongoDB records.
   * Idempotent: returns existing state if already initialized.
   */
  static async init(interviewId) {
    const redis = getRedisClient();
    const stateKey = this.getStateKey(interviewId);

    // 1. Check existing state in Redis
    const existingRaw = await redis.get(stateKey);
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        return redisActiveStateSchema.parse(parsed);
      } catch (_) {
        // If existing state corrupt, proceed with reinitialization
      }
    }

    // 2. Fetch required MongoDB records
    const interview = await Interview.findById(interviewId);
    if (!interview) throw new MissingInterviewDataError('Interview');

    const [resume, jd, mapping, plan] = await Promise.all([
      Resume.findOne({ interviewId }),
      JobDescription.findOne({ interviewId }),
      Mapping.findOne({ interviewId }),
      InterviewPlan.findOne({ interviewId })
    ]);

    if (!resume) throw new MissingInterviewDataError('Resume');
    if (!jd) throw new MissingInterviewDataError('JobDescription');
    if (!mapping) throw new MissingInterviewDataError('Mapping');
    if (!plan) throw new MissingInterviewDataError('InterviewPlan');

    if (!Array.isArray(plan.sections) || plan.sections.length === 0) {
      throw new EmptyInterviewPlanError('Interview plan contains 0 sections');
    }

    // 3. Map Assessment Plan sections
    const mappedSections = plan.sections.map((sec) => {
      let mappedType = 'project';
      if (sec.type === 'introduction' || sec.type === 'intro') {
        mappedType = 'intro';
      } else if (sec.type === 'remaining_requirements' || sec.type === 'requirements') {
        mappedType = 'requirements';
      }

      const priority = mappedType === 'project' ? normalizePriority(sec.projectPriority) : undefined;

      const groups = (sec.groups || []).map((g) => ({
        name: g.name,
        baseDifficulty: g.baseDifficulty || 'medium',
        focusAreas: Array.isArray(g.focusAreas) && g.focusAreas.length > 0 ? g.focusAreas : g.topics || []
      }));

      return {
        order: sec.order,
        type: mappedType,
        name: sec.title || sec.projectName || `Section ${sec.order}`,
        priority,
        durationMinutes: sec.durationMinutes || (mappedType === 'intro' ? 5 : mappedType === 'project' ? 15 : 10),
        groups
      };
    });

    // 4. Initial skill_state and claim_verification
    const skillState = {};
    const allJdSkills = [
      ...(jd.data?.required_skills || []),
      ...(jd.data?.preferred_skills || [])
    ];
    for (const skill of allJdSkills) {
      if (typeof skill === 'string' && skill.trim()) {
        skillState[skill.trim()] = {
          status: 'not_assessed',
          evidenceIds: [],
          lastUpdated: new Date().toISOString()
        };
      }
    }

    const claimVerification = {};
    const candidateClaims = resume.data?.claims || [];
    candidateClaims.forEach((claim, idx) => {
      const claimText = typeof claim === 'string' ? claim : claim.text;
      if (claimText) {
        const claimKey = `claim_${idx + 1}`;
        claimVerification[claimKey] = {
          claimText,
          status: 'not_assessed',
          evidenceIds: [],
          notes: ''
        };
      }
    });

    const firstSection = mappedSections[0];
    const firstGroup = firstSection?.groups?.[0];

    // 5. Construct Initial Active Working State
    const initialState = {
      candidate_context: {
        candidateId: String(interview.candidateId || resume.candidateId || ''),
        name: resume.data?.candidate?.name || 'Candidate',
        email: resume.data?.candidate?.email || '',
        experience: this.formatExperience(resume.data),
        skills: (resume.data?.skills || []).map((s) => (typeof s === 'string' ? { name: s, level: '', evidence: '' } : s)),
        projects: (resume.data?.projects || []).map((p) => ({
          name: p.name || '',
          description: p.description || '',
          technologies: Array.isArray(p.technologies) ? p.technologies : [],
          responsibilities: Array.isArray(p.responsibilities) ? p.responsibilities : []
        })),
        claims: candidateClaims.map((c) => ({
          text: typeof c === 'string' ? c : c.text,
          relatedProject: typeof c === 'object' ? c.relatedProject || '' : ''
        }))
      },
      job_context: {
        job_title: jd.data?.job_title || '',
        required_skills: jd.data?.required_skills || [],
        preferred_skills: jd.data?.preferred_skills || [],
        responsibilities: jd.data?.responsibilities || [],
        qualifications: jd.data?.qualifications || [],
        technologies: jd.data?.technologies || [],
        experience_requirements: jd.data?.experience_requirements || ''
      },
      assessment_plan: {
        experienceLevel: plan.experienceLevel || interview.experienceLevel || '',
        totalYears: typeof interview.totalYears === 'number' ? interview.totalYears : 0,
        sections: mappedSections
      },
      interview_state: {
        current_phase: firstSection?.type || 'intro',
        current_project: firstSection?.type === 'project' ? firstSection.name : '',
        current_group: firstGroup?.name || '',
        current_question: null,
        question_history: [],
        answer_history: [],
        evidence: [],
        skill_state: skillState,
        claim_verification: claimVerification,
        evidence_gaps: [],
        remaining_areas: [],
        interview_status: 'active',
        progress: {
          sectionIdx: 0,
          groupIdx: 0,
          probesUsed: 0,
          questionsInGroup: 0,
          startedAt: new Date().toISOString(),
          elapsedMs: 0
        },
        consent: Boolean(interview.live?.consentAt),
        analysis_queue: [],
        question_bank: interview.questionBank ? Object.fromEntries(interview.questionBank instanceof Map ? interview.questionBank : Object.entries(interview.questionBank)) : {}
      }
    };

    // 6. Check for Recovery: if turns exist in Mongo, replay them
    const turns = await InterviewTurn.find({ interviewId }).sort({ seq: 1 });
    if (turns.length > 0) {
      for (const t of turns) {
        if (t.question) initialState.interview_state.question_history.push(t.question);
        if (t.answer) initialState.interview_state.answer_history.push(t.answer);
        if (Array.isArray(t.evidence)) {
          initialState.interview_state.evidence.push(...t.evidence);
        }
      }
      initialState.interview_state.current_question = turns[turns.length - 1]?.question || null;
      initialState.interview_state.progress.questionsInGroup = turns.length;
    }

    // 7. Validate with Zod
    const validated = redisActiveStateSchema.parse(initialState);

    // 8. Write to Redis with TTL 6 hours
    await redis.set(stateKey, JSON.stringify(validated), 'EX', STATE_TTL_SECONDS);

    return validated;
  }

  /**
   * Read and validate active state from Redis (with recovery if missing)
   */
  static async get(interviewId) {
    const redis = getRedisClient();
    const stateKey = this.getStateKey(interviewId);
    const raw = await redis.get(stateKey);

    if (!raw) {
      // Key missing: check if Mongo IV is live or paused for recovery
      const iv = await Interview.findById(interviewId);
      if (iv && (iv.status === 'live' || iv.status === 'paused' || iv.status === 'recruiter_ready')) {
        return this.init(interviewId);
      }
      return null;
    }

    const parsed = JSON.parse(raw);
    return redisActiveStateSchema.parse(parsed);
  }

  /**
   * Atomic read-validate-mutate-validate-write under distributed lock
   */
  static async patch(interviewId, mutateFn) {
    const token = await this.acquireLock(interviewId);
    const redis = getRedisClient();
    const stateKey = this.getStateKey(interviewId);

    try {
      let state = await this.get(interviewId);
      if (!state) {
        state = await this.init(interviewId);
      }

      // Execute caller's mutation function
      const mutated = (await mutateFn(state)) || state;

      // Validate modified state before write
      const validated = redisActiveStateSchema.parse(mutated);

      // Write-through to Redis with refreshed TTL
      await redis.set(stateKey, JSON.stringify(validated), 'EX', STATE_TTL_SECONDS);

      return validated;
    } finally {
      await this.releaseLock(interviewId, token);
    }
  }

  /**
   * Append new generated question under lock
   */
  static async appendQuestion(interviewId, qData) {
    return this.patch(interviewId, (state) => {
      const validatedQ = questionSchema.parse(qData);
      state.interview_state.current_question = validatedQ;
      state.interview_state.question_history.push(validatedQ);

      state.interview_state.progress.questionsInGroup += 1;
      if (validatedQ.kind === 'probe') {
        state.interview_state.progress.probesUsed += 1;
      }

      return state;
    });
  }

  /**
   * Append candidate answer and evidence under lock, with write-through to MongoDB InterviewTurn
   */
  static async appendAnswer(interviewId, aData, evidenceItems = []) {
    const validatedA = answerSchema.parse(aData);
    const validatedEvidence = (evidenceItems || []).map((e) => evidenceSchema.parse(e));

    const updatedState = await this.patch(interviewId, (state) => {
      state.interview_state.answer_history.push(validatedA);
      if (validatedEvidence.length > 0) {
        state.interview_state.evidence.push(...validatedEvidence);
      }
      return state;
    });

    // Write-through to MongoDB InterviewTurn
    const seq = updatedState.interview_state.answer_history.length;
    const currentQuestion = updatedState.interview_state.question_history.find(
      (q) => q.id === validatedA.questionId
    ) || updatedState.interview_state.current_question;

    await InterviewTurn.findOneAndUpdate(
      { interviewId: new mongoose.Types.ObjectId(interviewId), seq },
      {
        interviewId: new mongoose.Types.ObjectId(interviewId),
        seq,
        question: currentQuestion,
        answer: validatedA,
        evidence: validatedEvidence,
        ts: new Date()
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    return updatedState;
  }

  /**
   * Finalize snapshot: marks status completing and returns final state
   */
  static async finalizeSnapshot(interviewId) {
    return this.patch(interviewId, (state) => {
      state.interview_state.interview_status = 'completing';
      return state;
    });
  }

  /**
   * Destroy state key with optional grace TTL (default 3600 seconds)
   */
  static async destroy(interviewId, ttlSeconds = 3600) {
    const redis = getRedisClient();
    const stateKey = this.getStateKey(interviewId);
    if (ttlSeconds <= 0) {
      await redis.del(stateKey);
    } else {
      await redis.expire(stateKey, ttlSeconds);
    }
  }
}

export default RedisStateManager;

