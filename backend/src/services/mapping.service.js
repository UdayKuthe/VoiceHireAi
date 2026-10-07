import { GeminiService } from './gemini.service.js';
import { MAPPING_PROMPT } from '../prompts/mapping.prompt.js';
import { mappingDataSchema } from '../schemas/mapping.schema.js';
import { Resume } from '../models/Resume.js';
import { JobDescription } from '../models/JobDescription.js';
import { Mapping } from '../models/Mapping.js';
import { Interview } from '../models/Interview.js';

export class MappingService {
  /**
   * Deterministically and accurately computes skill mapping and verification priorities
   * by comparing Candidate profile (skills, projects, claims, certifications) against JD requirements.
   */
  static computeSkillMapping(resumeData, jdData) {
    const candidateSkills = (resumeData.skills || []).map((s) => (typeof s === 'string' ? s : s.name));
    const candidateProjects = resumeData.projects || [];
    const candidateClaims = resumeData.claims || [];
    const candidateCerts = resumeData.certifications || [];

    const candidateTechs = candidateProjects.flatMap((p) => p.technologies || []);
    const candidateFullText = [
      ...candidateSkills,
      ...candidateTechs,
      ...candidateCerts,
      ...candidateProjects.flatMap((p) => [p.name, p.description, ...(p.responsibilities || [])]),
      ...candidateClaims.map((c) => c.text)
    ].join(' ').toLowerCase();

    // Mapping alias table for domain competencies
    const ALIAS_MAP = {
      'llms / generative ai': ['llm', 'llms', 'generative ai', 'genai', 'mistral', 'gpt', 'transformer', 'huggingface'],
      'rag & vector databases': ['rag', 'vector database', 'chromadb', 'pinecone', 'retrieval', 'bge', 'embeddings', 'langchain'],
      'pytorch / tensorflow': ['pytorch', 'tensorflow', 'keras'],
      'fastapi / rest apis': ['fastapi', 'rest api', 'rest apis'],
      'sql': ['sql', 'mysql', 'postgresql', 'sqlite'],
      'git': ['git', 'github', 'github actions', 'gitlab'],
      'docker & cloud': ['docker', 'kubernetes', 'aws', 'gcp', 'azure', 'cloud'],
      'mlops / model deployment': ['mlops', 'model deployment', 'quantized inference', 'onnx', 'serving'],
      'machine learning': ['machine learning', 'scikit-learn', 'ml', 'pandas', 'numpy'],
      'deep learning': ['deep learning', 'pytorch', 'tensorflow', 'neural', 'cnn', 'resnet', 'bart'],
      'nlp': ['nlp', 'natural language', 'spacy', 'sbert', 'whisper', 'bart', 'text summarization']
    };

    const isMatch = (skill) => {
      const sLower = skill.toLowerCase();
      // 1. Direct candidate skill match
      if (candidateSkills.some((cs) => cs.toLowerCase() === sLower || cs.toLowerCase().includes(sLower) || sLower.includes(cs.toLowerCase()))) {
        return true;
      }
      // 2. Alias match
      const aliases = ALIAS_MAP[sLower];
      if (aliases && aliases.some((a) => candidateFullText.includes(a))) {
        return true;
      }
      // 3. Sub-part match if compound skill
      const subParts = skill.split(/[/&,]/).map((p) => p.trim().toLowerCase());
      if (subParts.length > 1) {
        return subParts.some((sp) => candidateFullText.includes(sp));
      }
      return candidateFullText.includes(sLower);
    };

    const matchedSkills = [];
    const partialSkills = [];
    const missingSkills = [];

    const reqSkills = jdData.required_skills || [];
    for (const req of reqSkills) {
      if (isMatch(req)) {
        matchedSkills.push(req);
      } else {
        missingSkills.push(req);
      }
    }

    const prefSkills = jdData.preferred_skills || [];
    for (const pref of prefSkills) {
      if (isMatch(pref)) {
        if (!matchedSkills.includes(pref)) {
          matchedSkills.push(pref);
        }
      } else {
        if (!partialSkills.includes(pref)) {
          partialSkills.push(pref);
        }
      }
    }

    // Verification Priorities based on candidate's major project claims & key metrics
    const verificationPriorities = [];

    // 1. Technical metrics & architectural claims from candidate's real projects
    const technicalClaims = candidateClaims.filter((c) =>
      /(?:rouge|bertscore|latency|throughput|f1|quantiz|fine-tun|fusion|pipeline|lora|rag|chromadb|whisper|bart)/i.test(c.text)
    );

    for (const claim of technicalClaims.slice(0, 2)) {
      const truncated = claim.text.length > 95 ? claim.text.slice(0, 92) + '...' : claim.text;
      verificationPriorities.push({
        item: truncated,
        reason: `Key technical metric and implementation claim in ${claim.relatedProject || 'candidate project'}. Probe experimental methodology, baseline comparisons, and architectural trade-offs.`,
        priority: 'high'
      });
    }

    // 2. Gaps or required competencies to verify
    for (const missing of missingSkills.slice(0, 2)) {
      verificationPriorities.push({
        item: `${missing} Architecture & Practical Experience`,
        reason: `Core competency listed in JD requirements without clear documented evidence on candidate resume. Assess theoretical grounding and ability to ramp up.`,
        priority: 'high'
      });
    }

    for (const partial of partialSkills.slice(0, 1)) {
      verificationPriorities.push({
        item: `${partial} Hands-on Exposure`,
        reason: `Preferred skill in job profile. Verify candidate's familiarity with real-world tooling and workflows.`,
        priority: 'medium'
      });
    }

    // Build skillDetails carrying jdPriority for every JD skill
    const skillDetails = [];
    for (const req of reqSkills) {
      const status = matchedSkills.includes(req) ? 'matched' : (partialSkills.includes(req) ? 'partial' : 'missing');
      skillDetails.push({ skill: req, status, jdPriority: 'high' });
    }
    for (const pref of prefSkills) {
      if (!skillDetails.some((sd) => sd.skill.toLowerCase() === pref.toLowerCase())) {
        const status = matchedSkills.includes(pref) ? 'matched' : (partialSkills.includes(pref) ? 'partial' : 'missing');
        skillDetails.push({ skill: pref, status, jdPriority: 'medium' });
      }
    }

    return {
      matchedSkills: [...new Set(matchedSkills)],
      partialSkills: [...new Set(partialSkills)],
      missingSkills: [...new Set(missingSkills)],
      verificationPriorities,
      skillDetails
    };
  }

  /**
   * Helper to determine JD skill priority (JP)
   */
  static getJdPriority(skillName, jdData) {
    const sLower = skillName.toLowerCase();
    const reqSkills = (jdData.required_skills || []).map((s) => s.toLowerCase());
    const prefSkills = (jdData.preferred_skills || []).map((s) => s.toLowerCase());

    if (reqSkills.some((r) => r === sLower || r.includes(sLower) || sLower.includes(r))) {
      return 'high';
    }
    if (prefSkills.some((p) => p === sLower || p.includes(sLower) || sLower.includes(p))) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Server computes Project Priority (PP) from LLM or deterministic matches.
   * Score = Σ weight(JP) over matched JD skills (high=3, medium=2, low=1)
   * Thresholds: >= 6 => high, 3-5 => medium, < 3 => low. No JD match => low.
   * Ties: project matching more high-JP skills ranks first.
   * Preserves recruiter overrides (editedByRecruiter = true).
   */
  static computeProjectPriorities(resumeProjects = [], jdData, llmMatches = [], existingPriorities = []) {
    const JP_WEIGHTS = { high: 3, medium: 2, low: 1 };
    const TIER_THRESHOLDS = { high: 6, medium: 3 };

    const allJdSkills = [
      ...(jdData.required_skills || []).map((s) => ({ skill: s, jp: 'high' })),
      ...(jdData.preferred_skills || []).map((s) => ({ skill: s, jp: 'medium' }))
    ];

    const results = resumeProjects.map((project, index) => {
      const projName = project.name || `Project ${index + 1}`;
      const projectText = [
        projName,
        project.description || '',
        ...(project.technologies || []),
        ...(project.responsibilities || [])
      ].join(' ').toLowerCase();

      // Check if existing recruiter override exists
      const existing = existingPriorities.find((ep) => ep.projectName === projName) ||
        (project.editedByRecruiter ? { priority: project.priority, editedByRecruiter: true } : null);

      // Check if LLM matched skills for this project
      const llmMatch = llmMatches.find(
        (m) => m.projectName && m.projectName.toLowerCase() === projName.toLowerCase()
      );

      let matchedJdSkills = [];

      if (llmMatch && Array.isArray(llmMatch.matchedJdSkills) && llmMatch.matchedJdSkills.length > 0) {
        matchedJdSkills = llmMatch.matchedJdSkills.map((sk) => ({
          skill: sk,
          jdPriority: this.getJdPriority(sk, jdData)
        }));
      } else {
        // Deterministic matching against JD requirements
        for (const jdItem of allJdSkills) {
          const jdLower = jdItem.skill.toLowerCase();
          const subParts = jdLower.split(/[/&,]/).map((p) => p.trim());
          const hasMatch = projectText.includes(jdLower) || subParts.some((sp) => sp.length > 2 && projectText.includes(sp));

          if (hasMatch && !matchedJdSkills.some((m) => m.skill.toLowerCase() === jdLower)) {
            matchedJdSkills.push({
              skill: jdItem.skill,
              jdPriority: jdItem.jp
            });
          }
        }
      }

      // Deduplicate matched JD skills
      const seenSkills = new Set();
      const uniqueMatchedSkills = [];
      for (const m of matchedJdSkills) {
        const key = m.skill.toLowerCase();
        if (!seenSkills.has(key)) {
          seenSkills.add(key);
          uniqueMatchedSkills.push(m);
        }
      }

      // Calculate score = Σ weight(JP)
      let score = 0;
      let highJpCount = 0;
      for (const m of uniqueMatchedSkills) {
        const weight = JP_WEIGHTS[m.jdPriority] || 1;
        score += weight;
        if (m.jdPriority === 'high') {
          highJpCount++;
        }
      }

      // Compute tier: server computes tier, LLM does not set tier directly
      let priority = 'low';
      if (uniqueMatchedSkills.length === 0) {
        priority = 'low';
      } else if (score >= TIER_THRESHOLDS.high) {
        priority = 'high';
      } else if (score >= TIER_THRESHOLDS.medium) {
        priority = 'medium';
      } else {
        priority = 'low';
      }

      // Reason
      let reason = llmMatch?.reason;
      if (!reason) {
        if (uniqueMatchedSkills.length === 0) {
          reason = 'No direct JD skills evidenced in this project description or technologies.';
        } else {
          const skillSummary = uniqueMatchedSkills.map((s) => `${s.skill} (${s.jdPriority})`).join(', ');
          reason = `Matches ${uniqueMatchedSkills.length} JD requirement(s) (${highJpCount} high-JP): ${skillSummary}. Score: ${score}.`;
        }
      }

      // Respect recruiter override if previously set
      const isEditedByRecruiter = Boolean(existing?.editedByRecruiter);
      if (isEditedByRecruiter && existing.priority) {
        priority = existing.priority;
      }

      return {
        projectName: projName,
        priority,
        score,
        matchedJdSkills: uniqueMatchedSkills,
        reason,
        highJpCount,
        originalIndex: index,
        editedByRecruiter: isEditedByRecruiter
      };
    });

    // Sort order: high -> medium -> low
    // Ties: project matching more high-JP skills ranks first, then higher score
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    results.sort((a, b) => {
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      if (pDiff !== 0) return pDiff;

      const highDiff = b.highJpCount - a.highJpCount;
      if (highDiff !== 0) return highDiff;

      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      return a.originalIndex - b.originalIndex;
    });

    return results.map(({ originalIndex, highJpCount, ...item }) => item);
  }

  static async generateMapping(interviewId) {
    const resume = await Resume.findOne({ interviewId });
    if (!resume || !resume.data) {
      const err = new Error('Resume has not been extracted yet. Please extract resume first.');
      err.statusCode = 400;
      throw err;
    }

    const jd = await JobDescription.findOne({ interviewId });
    if (!jd || !jd.data) {
      const err = new Error('Job description has not been extracted yet. Please extract JD first.');
      err.statusCode = 400;
      throw err;
    }

    // Load any existing mapping to preserve recruiter edits
    const existingMapping = await Mapping.findOne({ interviewId });
    const existingPriorities = existingMapping?.projectPriorities || [];

    console.log('[MappingService] Generating skill mapping and project priorities for interview:', interviewId);

    let mappedResult = null;
    let llmProjectMatches = [];
    try {
      const prompt = `${MAPPING_PROMPT}

CANDIDATE RESUME JSON:
${JSON.stringify(resume.data, null, 2)}

JOB DESCRIPTION JSON:
${JSON.stringify(jd.data, null, 2)}
`;

      const aiResult = await GeminiService.generateJsonFromText({
        prompt,
        schema: mappingDataSchema,
        maxRetries: 1
      });

      const hasGenericDummy = aiResult?.matchedSkills?.includes('TypeScript') && !jd.data.required_skills?.includes('TypeScript');
      if (aiResult && aiResult.matchedSkills?.length > 0 && !hasGenericDummy) {
        mappedResult = aiResult;
        llmProjectMatches = aiResult.projectMatches || [];
      }
    } catch (err) {
      console.warn('[MappingService] Gemini mapping generation failed or quota exceeded:', err.message);
    }

    // High-fidelity fallback computed directly from actual candidate & JD data
    if (!mappedResult) {
      console.log('[MappingService] Computing deterministic skill mapping from actual resume & JD data');
      mappedResult = this.computeSkillMapping(resume.data, jd.data);
    }

    // Compute Project Priorities (PP) on the server
    const projectPriorities = this.computeProjectPriorities(
      resume.data.projects || [],
      jd.data,
      llmProjectMatches,
      existingPriorities
    );

    // Build skillDetails if not present
    const skillDetails = mappedResult.skillDetails || [];
    if (skillDetails.length === 0) {
      for (const req of (jd.data.required_skills || [])) {
        const status = (mappedResult.matchedSkills || []).includes(req) ? 'matched' : ((mappedResult.partialSkills || []).includes(req) ? 'partial' : 'missing');
        skillDetails.push({ skill: req, status, jdPriority: 'high' });
      }
      for (const pref of (jd.data.preferred_skills || [])) {
        if (!skillDetails.some((sd) => sd.skill.toLowerCase() === pref.toLowerCase())) {
          const status = (mappedResult.matchedSkills || []).includes(pref) ? 'matched' : ((mappedResult.partialSkills || []).includes(pref) ? 'partial' : 'missing');
          skillDetails.push({ skill: pref, status, jdPriority: 'medium' });
        }
      }
    }

    // Update Resume.data.projects[] with priority, priorityScore, priorityReason, matchedJdSkills
    if (Array.isArray(resume.data.projects)) {
      resume.data.projects = resume.data.projects.map((proj) => {
        const pp = projectPriorities.find(
          (p) => p.projectName.toLowerCase() === (proj.name || '').toLowerCase()
        );
        if (pp) {
          return {
            ...proj,
            priority: pp.priority,
            priorityScore: pp.score,
            priorityReason: pp.reason,
            matchedJdSkills: pp.matchedJdSkills,
            editedByRecruiter: pp.editedByRecruiter
          };
        }
        return proj;
      });
      resume.markModified('data');
      await resume.save();
    }

    // Overwrite existing mapping
    const mappingDoc = await Mapping.findOneAndUpdate(
      { interviewId },
      {
        interviewId,
        matchedSkills: mappedResult.matchedSkills || [],
        partialSkills: mappedResult.partialSkills || [],
        missingSkills: mappedResult.missingSkills || [],
        verificationPriorities: mappedResult.verificationPriorities || [],
        projectPriorities,
        skillDetails
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Interview.findByIdAndUpdate(interviewId, {
      analysisStatus: 'mapped'
    });

    console.log('[MappingService] Skill mapping and Project Priorities saved — projects:', mappingDoc.projectPriorities.length);
    return mappingDoc;
  }
}

export default MappingService;
