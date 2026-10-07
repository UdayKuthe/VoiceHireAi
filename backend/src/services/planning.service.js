import { GeminiService } from './gemini.service.js';
import { PLANNING_PROMPT } from '../prompts/planning.prompt.js';
import { interviewPlanDataSchema } from '../schemas/plan.schema.js';
import { Resume } from '../models/Resume.js';
import { JobDescription } from '../models/JobDescription.js';
import { Mapping } from '../models/Mapping.js';
import { InterviewPlan } from '../models/InterviewPlan.js';
import { Interview } from '../models/Interview.js';

export class PlanningService {
  /**
   * Constructs the deterministic dynamic sectioned interview plan
   */
  static buildDeterministicPlan(resumeData, jdData, mapping) {
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
          questionBudget: 2
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
          questionBudget: Math.max(1, linkedClaims.length)
        },
        {
          name: 'High-priority JD skills matched to this project',
          topics: highSkills,
          questionBudget: Math.max(1, highSkills.length)
        },
        {
          name: 'Medium-priority JD skills matched to this project',
          topics: medSkills,
          questionBudget: Math.max(1, medSkills.length)
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
        questionBudget: highUnmatched.length
      });
    }

    if (medUnmatched.length > 0) {
      remainingGroups.push({
        name: 'Medium-priority JD skills not used in any project',
        topics: medUnmatched,
        questionBudget: medUnmatched.length
      });
    }

    if (otherTopics.length > 0) {
      const selectedOther = otherTopics.slice(0, 3);
      remainingGroups.push({
        name: 'Other remaining JD requirements',
        topics: selectedOther,
        questionBudget: selectedOther.length
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

    let planSections = [];
    try {
      const prompt = `${PLANNING_PROMPT}

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
  skillDetails: mapping.skillDetails
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
      planSections = this.buildDeterministicPlan(resume.data, jd.data, mapping);
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
      if (sec.type === 'project') {
        const claimsGrp = (sec.groups || []).find((g) => g.name.toLowerCase().includes('claim')) || {
          name: 'Resume claims',
          topics: sec.resumeClaims || [],
          questionBudget: Math.max(1, (sec.resumeClaims || []).length)
        };
        const highGrp = (sec.groups || []).find((g) => g.name.toLowerCase().includes('high')) || {
          name: 'High-priority JD skills matched to this project',
          topics: [],
          questionBudget: 1
        };
        const medGrp = (sec.groups || []).find((g) => g.name.toLowerCase().includes('medium')) || {
          name: 'Medium-priority JD skills matched to this project',
          topics: [],
          questionBudget: 1
        };

        return {
          ...sec,
          order: idx + 1,
          groups: [
            {
              name: 'Resume claims',
              topics: claimsGrp.topics || [],
              questionBudget: claimsGrp.questionBudget || 1
            },
            {
              name: 'High-priority JD skills matched to this project',
              topics: highGrp.topics || [],
              questionBudget: highGrp.questionBudget || 1
            },
            {
              name: 'Medium-priority JD skills matched to this project',
              topics: medGrp.topics || [],
              questionBudget: medGrp.questionBudget || 1
            }
          ]
        };
      }

      return {
        ...sec,
        order: idx + 1,
        groups: (sec.groups || []).filter((g) => Array.isArray(g.topics) && g.topics.length > 0)
      };
    });

    // Overwrite existing plan
    const planDoc = await InterviewPlan.findOneAndUpdate(
      { interviewId },
      {
        interviewId,
        sections: finalSections
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Interview.findByIdAndUpdate(interviewId, {
      analysisStatus: 'planned'
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

    // Re-assign order 1..N and clean groups
    const reordered = validated.sections.map((sec, idx) => ({
      ...sec,
      order: idx + 1,
      groups: (sec.groups || []).filter((g) => Array.isArray(g.topics) && g.topics.length > 0)
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

