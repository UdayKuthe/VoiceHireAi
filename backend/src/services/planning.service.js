import { GeminiService } from './gemini.service.js';
import { PLANNING_PROMPT } from '../prompts/planning.prompt.js';
import { interviewPlanDataSchema } from '../schemas/plan.schema.js';
import { Resume } from '../models/Resume.js';
import { JobDescription } from '../models/JobDescription.js';
import { Mapping } from '../models/Mapping.js';
import { InterviewPlan } from '../models/InterviewPlan.js';
import { Interview } from '../models/Interview.js';

export const getLevelPlanConfig = (level) => {
  const normLevel = (level || '').toLowerCase();
  switch (normLevel) {
    case 'senior':
      return {
        level: 'senior',
        baseDifficulty: 'hard',
        projectFocusAreas: ['architecture', 'scalability', 'failure handling', 'leadership'],
        remainingBaseDifficulty: 'hard',
        remainingFocusAreas: ['scenario and judgment questions'],
        claimBudgetMultiplier: 1,
        highSkillBudgetMin: 2,
        medSkillBudgetMin: 1
      };
    case 'mid':
      return {
        level: 'mid',
        baseDifficulty: 'medium',
        projectFocusAreas: ['design decisions', 'trade-offs', 'performance', 'ownership'],
        remainingBaseDifficulty: 'medium',
        remainingFocusAreas: ['concept plus scenario'],
        claimBudgetMultiplier: 1,
        highSkillBudgetMin: 2,
        medSkillBudgetMin: 1
      };
    case 'junior':
      return {
        level: 'junior',
        baseDifficulty: 'easy',
        projectFocusAreas: ['implementation', 'debugging', 'tool choices'],
        remainingBaseDifficulty: 'medium',
        remainingFocusAreas: ['exposure plus one concept question'],
        claimBudgetMultiplier: 1,
        highSkillBudgetMin: 1,
        medSkillBudgetMin: 1
      };
    case 'fresher':
    default:
      return {
        level: normLevel === 'fresher' ? 'fresher' : 'fresher',
        baseDifficulty: 'easy',
        projectFocusAreas: ['basics', 'own contribution', 'how it works'],
        remainingBaseDifficulty: 'easy',
        remainingFocusAreas: ['exposure check only'],
        claimBudgetMultiplier: 1,
        highSkillBudgetMin: 1,
        medSkillBudgetMin: 1
      };
  }
};

export class PlanningService {
  /**
   * Constructs the deterministic dynamic sectioned interview plan
   */
  static buildDeterministicPlan(resumeData, jdData, mapping, experienceLevel = 'fresher') {
    const cfg = getLevelPlanConfig(experienceLevel);
    const sections = [];
    let order = 1;

    // 1. Introduction section (always first)
    sections.push({
      order: order++,
      type: 'introduction',
      title: 'Candidate Introduction',
      projectName: '',
      projectPriority: '',
      resumeClaims: [],
      groups: [
        {
          name: 'Self introduction',
          topics: ['background', 'key skills', 'projects they want to highlight'],
          questionBudget: 2,
          baseDifficulty: cfg.level === 'senior' ? 'medium' : 'easy',
          focusAreas: ['background', 'key skills', 'projects they want to highlight']
        }
      ]
    });

    // 2. Project sections: exactly one per resume project, ordered high -> medium -> low
    const ppList = [...(mapping.projectPriorities || [])];
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    ppList.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));

    const candidateClaims = resumeData.claims || [];
    const allProjectMatchedSkillSet = new Set();

    for (const proj of ppList) {
      const projName = proj.projectName;
      const projPriority = proj.priority || 'low';

      // Find resume claims linked to this project
      const linkedClaims = candidateClaims
        .filter((c) => {
          const rel = (c.relatedProject || '').toLowerCase();
          const pName = projName.toLowerCase();
          return rel === pName || rel.includes(pName) || pName.includes(rel);
        })
        .map((c) => c.text);

      const matchedSkills = proj.matchedJdSkills || [];
      const highSkills = [];
      const medSkills = [];

      for (const ms of matchedSkills) {
        allProjectMatchedSkillSet.add(ms.skill.toLowerCase());
        if (ms.jdPriority === 'high') {
          highSkills.push(ms.skill);
        } else if (ms.jdPriority === 'medium') {
          medSkills.push(ms.skill);
        }
      }

      // Project sections always contain exactly these 3 groups in order:
      const groups = [
        {
          name: 'Resume claims',
          topics: linkedClaims,
          questionBudget: Math.max(1, linkedClaims.length),
          baseDifficulty: cfg.baseDifficulty,
          focusAreas: cfg.projectFocusAreas
        },
        {
          name: 'High-priority JD skills matched to this project',
          topics: highSkills,
          questionBudget: Math.max(cfg.highSkillBudgetMin, highSkills.length),
          baseDifficulty: cfg.baseDifficulty,
          focusAreas: cfg.projectFocusAreas
        },
        {
          name: 'Medium-priority JD skills matched to this project',
          topics: medSkills,
          questionBudget: Math.max(cfg.medSkillBudgetMin, medSkills.length),
          baseDifficulty: cfg.baseDifficulty,
          focusAreas: cfg.projectFocusAreas
        }
      ];

      sections.push({
        order: order++,
        type: 'project',
        title: projName,
        projectName: projName,
        projectPriority: projPriority,
        resumeClaims: linkedClaims,
        groups
      });
    }

    // 3. Remaining requirements section (always last)
    const reqSkills = jdData.required_skills || [];
    const prefSkills = jdData.preferred_skills || [];

    const highUnmatched = reqSkills.filter((s) => !allProjectMatchedSkillSet.has(s.toLowerCase()));
    const medUnmatched = prefSkills.filter((s) => !allProjectMatchedSkillSet.has(s.toLowerCase()));

    // Other remaining JD requirements: responsibilities / experience requirements
    const otherTopics = [];
    if (Array.isArray(jdData.responsibilities)) {
      for (const resp of jdData.responsibilities) {
        if (resp.length > 15 && !allProjectMatchedSkillSet.has(resp.toLowerCase())) {
          otherTopics.push(resp.length > 80 ? resp.slice(0, 77) + '...' : resp);
        }
      }
    }
    if (jdData.experience_requirements && otherTopics.length < 2) {
      otherTopics.push(jdData.experience_requirements);
    }
    if (otherTopics.length === 0) {
      otherTopics.push('Production deployment & reliability engineering');
    }

    const remainingGroups = [];
    if (highUnmatched.length > 0) {
      remainingGroups.push({
        name: 'High-priority JD skills not used in any project',
        topics: highUnmatched,
        questionBudget: Math.max(cfg.highSkillBudgetMin, highUnmatched.length),
        baseDifficulty: cfg.remainingBaseDifficulty,
        focusAreas: cfg.remainingFocusAreas
      });
    }

    if (medUnmatched.length > 0) {
      remainingGroups.push({
        name: 'Medium-priority JD skills not used in any project',
        topics: medUnmatched,
        questionBudget: Math.max(cfg.medSkillBudgetMin, medUnmatched.length),
        baseDifficulty: cfg.remainingBaseDifficulty,
        focusAreas: cfg.remainingFocusAreas
      });
    }

    if (otherTopics.length > 0) {
      const selectedOther = otherTopics.slice(0, 3);
      remainingGroups.push({
        name: 'Other remaining JD requirements',
        topics: selectedOther,
        questionBudget: selectedOther.length,
        baseDifficulty: cfg.remainingBaseDifficulty,
        focusAreas: cfg.remainingFocusAreas
      });
    }

    if (remainingGroups.length > 0) {
      sections.push({
        order: order++,
        type: 'remaining_requirements',
        title: 'JD Requirements Not Covered in Projects',
        projectName: '',
        projectPriority: '',
        resumeClaims: [],
        groups: remainingGroups
      });
    }

    return sections;
  }

  static async generatePlan(interviewId) {
    const resume = await Resume.findOne({ interviewId });
    if (!resume || !resume.data) {
      const err = new Error('Resume data missing. Please extract resume first.');
      err.statusCode = 400;
      throw err;
    }

    const jd = await JobDescription.findOne({ interviewId });
    if (!jd || !jd.data) {
      const err = new Error('Job description missing. Please extract JD first.');
      err.statusCode = 400;
      throw err;
    }

    const mapping = await Mapping.findOne({ interviewId });
    if (!mapping) {
      const err = new Error('Mapping data missing. Please run mapping before generating interview plan.');
      err.statusCode = 400;
      throw err;
    }

    const interviewDoc = await Interview.findById(interviewId);
    const experienceLevel =
      interviewDoc?.experienceLevel ||
      resume.data?.experienceSummary?.experienceLevel ||
      mapping?.experienceLevel ||
      'fresher';
    const cfg = getLevelPlanConfig(experienceLevel);

    let planSections = [];
    try {
      const prompt = `${PLANNING_PROMPT}

CANDIDATE EXPERIENCE JSON:
${JSON.stringify({
  experienceLevel: cfg.level,
  totalYears: resume.data?.experienceSummary?.totalYears || 0,
  companies: (resume.data?.experience || []).map((r) => ({
    company: r.company,
    years: r.years
  }))
}, null, 2)}

CANDIDATE RESUME JSON:
${JSON.stringify(resume.data, null, 2)}

JOB DESCRIPTION JSON:
${JSON.stringify(jd.data, null, 2)}

SKILL MAPPING & PROJECT PRIORITIES JSON:
${JSON.stringify({
  projectPriorities: mapping.projectPriorities,
  matchedSkills: mapping.matchedSkills,
  partialSkills: mapping.partialSkills,
  missingSkills: mapping.missingSkills,
  verificationPriorities: mapping.verificationPriorities,
  skillDetails: mapping.skillDetails,
  experienceLevel: cfg.level
}, null, 2)}
`;

      const aiPlanResult = await GeminiService.generateJsonFromText({
        prompt,
        schema: interviewPlanDataSchema,
        maxRetries: 1
      });

      if (aiPlanResult && Array.isArray(aiPlanResult.sections) && aiPlanResult.sections.length >= 2) {
        // Filter out any empty groups from AI output
        planSections = aiPlanResult.sections.map((sec) => ({
          ...sec,
          groups: (sec.groups || []).filter((g) => Array.isArray(g.topics) && g.topics.length > 0)
        }));
      }
    } catch (err) {
      console.warn('[PlanningService] Gemini plan generation failed, using deterministic sectioned plan:', err.message);
    }

    // If Gemini didn't return or was incomplete, use full deterministic plan
    if (!planSections || planSections.length === 0) {
      planSections = this.buildDeterministicPlan(resume.data, jd.data, mapping, cfg.level);
    }

    // Enforce section ordering: introduction first, project sections, remaining_requirements last
    const typeOrder = { introduction: 1, project: 2, remaining_requirements: 3 };
    const priorityWeight = { high: 3, medium: 2, low: 1 };

    planSections.sort((a, b) => {
      const tDiff = (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
      if (tDiff !== 0) return tDiff;

      if (a.type === 'project' && b.type === 'project') {
        return (priorityWeight[b.projectPriority] || 0) - (priorityWeight[a.projectPriority] || 0);
      }
      return 0;
    });

    // Re-index order 1..N.
    // For project sections, ensure exactly the 3 mandatory groups in order (even when empty).
    // For non-project sections, omit empty groups.
    const finalSections = planSections.map((sec, idx) => {
      if (sec.type === 'introduction') {
        return {
          ...sec,
          order: idx + 1,
          groups: (sec.groups || []).map((g) => ({
            ...g,
            baseDifficulty: g.baseDifficulty || (cfg.level === 'senior' ? 'medium' : 'easy'),
            focusAreas: Array.isArray(g.focusAreas) && g.focusAreas.length > 0
              ? g.focusAreas
              : ['background', 'key skills', 'projects they want to highlight']
          }))
        };
      }

      if (sec.type === 'project') {
        const claimsGrp = (sec.groups || []).find((g) => g.name.toLowerCase().includes('claim')) || {
          name: 'Resume claims',
          topics: sec.resumeClaims || [],
          questionBudget: Math.max(1, (sec.resumeClaims || []).length)
        };
        const highGrp = (sec.groups || []).find((g) => g.name.toLowerCase().includes('high')) || {
          name: 'High-priority JD skills matched to this project',
          topics: [],
          questionBudget: cfg.highSkillBudgetMin
        };
        const medGrp = (sec.groups || []).find((g) => g.name.toLowerCase().includes('medium')) || {
          name: 'Medium-priority JD skills matched to this project',
          topics: [],
          questionBudget: cfg.medSkillBudgetMin
        };

        return {
          ...sec,
          order: idx + 1,
          groups: [
            {
              name: 'Resume claims',
              topics: claimsGrp.topics || [],
              questionBudget: claimsGrp.questionBudget || 1,
              baseDifficulty: claimsGrp.baseDifficulty || cfg.baseDifficulty,
              focusAreas: Array.isArray(claimsGrp.focusAreas) && claimsGrp.focusAreas.length > 0
                ? claimsGrp.focusAreas
                : cfg.projectFocusAreas
            },
            {
              name: 'High-priority JD skills matched to this project',
              topics: highGrp.topics || [],
              questionBudget: Math.max(cfg.highSkillBudgetMin, highGrp.questionBudget || 1),
              baseDifficulty: highGrp.baseDifficulty || cfg.baseDifficulty,
              focusAreas: Array.isArray(highGrp.focusAreas) && highGrp.focusAreas.length > 0
                ? highGrp.focusAreas
                : cfg.projectFocusAreas
            },
            {
              name: 'Medium-priority JD skills matched to this project',
              topics: medGrp.topics || [],
              questionBudget: Math.max(cfg.medSkillBudgetMin, medGrp.questionBudget || 1),
              baseDifficulty: medGrp.baseDifficulty || cfg.baseDifficulty,
              focusAreas: Array.isArray(medGrp.focusAreas) && medGrp.focusAreas.length > 0
                ? medGrp.focusAreas
                : cfg.projectFocusAreas
            }
          ]
        };
      }

      // remaining_requirements section
      return {
        ...sec,
        order: idx + 1,
        groups: (sec.groups || [])
          .filter((g) => Array.isArray(g.topics) && g.topics.length > 0)
          .map((g) => ({
            ...g,
            baseDifficulty: g.baseDifficulty || cfg.remainingBaseDifficulty,
            focusAreas: Array.isArray(g.focusAreas) && g.focusAreas.length > 0
              ? g.focusAreas
              : cfg.remainingFocusAreas
          }))
      };
    });

    // Overwrite existing plan
    const planDoc = await InterviewPlan.findOneAndUpdate(
      { interviewId },
      {
        interviewId,
        experienceLevel: cfg.level,
        sections: finalSections
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Interview.findByIdAndUpdate(interviewId, {
      analysisStatus: 'planned',
      experienceLevel: cfg.level
    });

    return planDoc;
  }

  static async updatePlan(interviewId, sections) {
    if (!Array.isArray(sections)) {
      const err = new Error('Sections must be an array.');
      err.statusCode = 400;
      throw err;
    }

    // Validate using Zod schema
    const validated = interviewPlanDataSchema.parse({ sections });

    const existingPlan = await InterviewPlan.findOne({ interviewId });
    const cfg = getLevelPlanConfig(existingPlan?.experienceLevel || 'fresher');

    // Re-assign order 1..N and clean groups while ensuring baseDifficulty and focusAreas are preserved
    const reordered = validated.sections.map((sec, idx) => ({
      ...sec,
      order: idx + 1,
      groups: (sec.groups || [])
        .filter((g) => Array.isArray(g.topics) && g.topics.length > 0)
        .map((g) => ({
          ...g,
          baseDifficulty: g.baseDifficulty || (sec.type === 'project' ? cfg.baseDifficulty : (sec.type === 'introduction' ? (cfg.level === 'senior' ? 'medium' : 'easy') : cfg.remainingBaseDifficulty)),
          focusAreas: Array.isArray(g.focusAreas) && g.focusAreas.length > 0
            ? g.focusAreas
            : (sec.type === 'project' ? cfg.projectFocusAreas : (sec.type === 'introduction' ? ['background', 'key skills', 'projects they want to highlight'] : cfg.remainingFocusAreas))
        }))
    }));

    const planDoc = await InterviewPlan.findOneAndUpdate(
      { interviewId },
      { sections: reordered },
      { returnDocument: 'after' }
    );

    if (!planDoc) {
      const err = new Error('Interview plan not found to update.');
      err.statusCode = 404;
      throw err;
    }

    return planDoc;
  }
}

export default PlanningService;

