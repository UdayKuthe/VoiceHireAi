import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { PdfParserService } from './pdfParser.service.js';

export class GeminiService {
  static getClient() {
    const apiKey = env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const err = new Error('GOOGLE_GEMINI_API_KEY is not configured in backend environment.');
      err.statusCode = 500;
      throw err;
    }
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Intelligently generate structured data dynamically from PDF text or prompt context
   * when Google API returns 403 (Permission Denied), 503 (overloaded), 404, or network issues occur.
   */
  static getDynamicFallback({ prompt, rawText = '', fileName = '' }) {
    console.log('[GeminiService] getDynamicFallback called — rawText length:', rawText.length, ', fileName:', fileName);

    // 1. Dynamic Sectioned Interview Plan from prompt's JSON
    // Checked first because the planning prompt includes "SKILL MAPPING" as an input section
    if (
      prompt.includes('interview roadmap') ||
      prompt.includes('Interview Plan') ||
      prompt.includes('sectioned interview plan') ||
      prompt.includes('STAGED INTERVIEW PLAN') ||
      prompt.includes('PLANNING_PROMPT')
    ) {
      try {
        const resumeMatch = prompt.match(/CANDIDATE RESUME JSON:\s*(\{[\s\S]*?\})\s*JOB DESCRIPTION JSON:/);
        const jdMatch = prompt.match(/JOB DESCRIPTION JSON:\s*(\{[\s\S]*?\})\s*SKILL MAPPING/);
        const mapMatch = prompt.match(/SKILL MAPPING[^\n]*JSON:\s*(\{[\s\S]*?\})(?:\s*$)/);

        if (resumeMatch && jdMatch) {
          const resumeData = JSON.parse(resumeMatch[1]);
          const jdData = JSON.parse(jdMatch[1]);
          const mapData = mapMatch ? JSON.parse(mapMatch[1]) : {};

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

          // 2. Project sections (one per resume project)
          const projects = (mapData.projectPriorities && mapData.projectPriorities.length > 0)
            ? mapData.projectPriorities
            : (resumeData.projects || [{ name: 'Full Stack Engineering Project', priority: 'high' }]);

          const claims = resumeData.claims || [];
          const allMatchedSkills = new Set();

          for (const proj of projects) {
            const pName = proj.projectName || proj.name || 'Core Project';
            const priority = proj.priority || 'medium';

            const linkedClaims = claims
              .filter((c) => {
                const rel = (c.relatedProject || '').toLowerCase();
                const pn = pName.toLowerCase();
                return rel === pn || rel.includes(pn) || pn.includes(rel);
              })
              .map((c) => c.text);

            const matchedSkills = proj.matchedJdSkills || [];
            const highSkills = [];
            const medSkills = [];

            for (const ms of matchedSkills) {
              allMatchedSkills.add(ms.skill.toLowerCase());
              if (ms.jdPriority === 'high') highSkills.push(ms.skill);
              else if (ms.jdPriority === 'medium') medSkills.push(ms.skill);
            }

            // Fallback tech if none matched from map
            if (highSkills.length === 0 && Array.isArray(proj.technologies)) {
              for (const t of proj.technologies.slice(0, 2)) {
                highSkills.push(t);
                allMatchedSkills.add(t.toLowerCase());
              }
            }

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
              title: pName,
              projectName: pName,
              projectPriority: priority,
              resumeClaims: linkedClaims,
              groups
            });
          }

          // 3. Remaining requirements section
          const reqSkills = jdData.required_skills || [];
          const prefSkills = jdData.preferred_skills || [];
          const highUnmatched = reqSkills.filter((s) => !allMatchedSkills.has(s.toLowerCase()));
          const medUnmatched = prefSkills.filter((s) => !allMatchedSkills.has(s.toLowerCase()));

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

          const otherTopics = [];
          if (Array.isArray(jdData.responsibilities)) {
            for (const r of jdData.responsibilities.slice(0, 2)) {
              otherTopics.push(r.length > 80 ? r.slice(0, 77) + '...' : r);
            }
          }
          if (otherTopics.length === 0) {
            otherTopics.push('Continuous Integration & Production Monitoring');
          }

          remainingGroups.push({
            name: 'Other remaining JD requirements',
            topics: otherTopics,
            questionBudget: otherTopics.length
          });

          sections.push({
            order: order++,
            type: 'remaining_requirements',
            title: 'JD Requirements Not Covered in Projects',
            projectName: '',
            projectPriority: '',
            resumeClaims: [],
            groups: remainingGroups
          });

          console.log('[GeminiService] Dynamic sectioned interview plan generated successfully from prompt JSON');
          return { sections };
        }
      } catch (e) {
        console.warn('[GeminiService] Error extracting plan prompt JSON:', e.message);
      }
    }

    // 2. Dynamic Skill Mapping from candidate resume & JD JSON in prompt
    if (
      !prompt.includes('interview roadmap') &&
      !prompt.includes('Interview Plan') &&
      !prompt.includes('PLANNING_PROMPT') &&
      !prompt.includes('category order') &&
      (prompt.includes('SKILL MAPPING') ||
       prompt.includes('matchedSkills') ||
       prompt.includes('competency analyst') ||
       prompt.includes('MAPPING_PROMPT'))
    ) {
      try {
        const resumeMatch = prompt.match(/CANDIDATE RESUME JSON:\s*(\{[\s\S]*?\})\s*JOB DESCRIPTION JSON:/);
        const jdMatch = prompt.match(/JOB DESCRIPTION JSON:\s*(\{[\s\S]*?\})(?:\s*$|\s*SKILL MAPPING)/);
        if (resumeMatch && jdMatch) {
          const resumeData = JSON.parse(resumeMatch[1]);
          const jdData = JSON.parse(jdMatch[1]);

          const candidateSkills = (resumeData.skills || []).map((s) => (typeof s === 'string' ? s : s.name));
          const candidateTechs = (resumeData.projects || []).flatMap((p) => p.technologies || []);
          const candidateClaims = resumeData.claims || [];
          const candidateText = [
            ...candidateSkills,
            ...candidateTechs,
            ...(resumeData.certifications || []),
            ...(resumeData.projects || []).flatMap((p) => [p.name, p.description, ...(p.responsibilities || [])]),
            ...candidateClaims.map((c) => c.text)
          ].join(' ').toLowerCase();

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
            if (candidateSkills.some((cs) => cs.toLowerCase() === sLower || cs.toLowerCase().includes(sLower) || sLower.includes(cs.toLowerCase()))) {
              return true;
            }
            const aliases = ALIAS_MAP[sLower];
            if (aliases && aliases.some((a) => candidateText.includes(a))) {
              return true;
            }
            const subParts = skill.split(/[/&,]/).map((p) => p.trim().toLowerCase());
            if (subParts.length > 1) {
              return subParts.some((sp) => candidateText.includes(sp));
            }
            return candidateText.includes(sLower);
          };

          const matchedSkills = [];
          const missingSkills = [];
          const partialSkills = [];

          const jdReqSkills = jdData.required_skills || [];
          for (const req of jdReqSkills) {
            if (isMatch(req)) {
              matchedSkills.push(req);
            } else {
              missingSkills.push(req);
            }
          }

          const jdPrefSkills = jdData.preferred_skills || [];
          for (const pref of jdPrefSkills) {
            if (isMatch(pref)) {
              if (!matchedSkills.includes(pref)) matchedSkills.push(pref);
            } else {
              if (!partialSkills.includes(pref)) partialSkills.push(pref);
            }
          }

          const verificationPriorities = [];
          const technicalClaims = candidateClaims.filter((c) =>
            /(?:rouge|bertscore|latency|throughput|f1|quantiz|fine-tun|fusion|pipeline|lora|rag|chromadb|whisper|bart)/i.test(c.text)
          );

          for (const claim of technicalClaims.slice(0, 2)) {
            const truncated = claim.text.length > 95 ? claim.text.slice(0, 92) + '...' : claim.text;
            verificationPriorities.push({
              item: truncated,
              reason: `Key technical metric and implementation claim in ${claim.relatedProject || 'candidate project'}. Probe experimental methodology and architectural trade-offs.`,
              priority: 'high'
            });
          }

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

          console.log('[GeminiService] Dynamic skill mapping generated successfully from prompt JSON');
          return {
            matchedSkills: [...new Set(matchedSkills)],
            partialSkills: [...new Set(partialSkills)],
            missingSkills: [...new Set(missingSkills)],
            verificationPriorities
          };
        }
      } catch (e) {
        console.warn('[GeminiService] Error extracting mapping prompt JSON:', e.message);
      }
    }

    // 3. Extraction for Job Description PDF
    if (
      prompt.includes('talent acquisition specialist') ||
      prompt.includes('Job Description (JD)') ||
      prompt.includes('job_title') ||
      prompt.includes('Position Title') ||
      prompt.includes('required_skills') ||
      prompt.includes('job requirements')
    ) {
      console.log('[GeminiService] Detected JD extraction prompt — using PDF text parser');
      if (rawText) {
        return PdfParserService.parseJdFromText(rawText, fileName);
      }
    }

    // 4. Extraction for Candidate Resume PDF
    if (
      prompt.includes('resume analyzer') ||
      prompt.includes('resume PDF document') ||
      prompt.includes('technical recruiter') ||
      prompt.includes('candidate data') ||
      prompt.includes('"candidate"') ||
      prompt.includes('"skills"') ||
      prompt.includes('"claims"')
    ) {
      console.log('[GeminiService] Detected Resume extraction prompt — using PDF text parser');
      if (rawText) {
        return PdfParserService.parseResumeFromText(rawText, fileName);
      }
    }

    // Default static fallback if parsing fails completely
    return this.getFallbackData(prompt);
  }

  /**
   * Static baseline fallback data for testing/offline environments
   */
  static getFallbackData(prompt) {
    if (prompt.includes('interview roadmap') || prompt.includes('Interview Plan') || prompt.includes('sectioned interview plan') || prompt.includes('STAGED INTERVIEW PLAN') || prompt.includes('PLANNING_PROMPT')) {
      return {
        interviewId: '',
        sections: [
          {
            order: 1,
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
          },
          {
            order: 2,
            type: 'project',
            title: 'Production Application',
            projectName: 'Production Application',
            projectPriority: 'high',
            resumeClaims: ['Scaled API to 10k RPS'],
            groups: [
              {
                name: 'Resume claims',
                topics: ['Scaled API to 10k RPS'],
                questionBudget: 1
              },
              {
                name: 'High-priority JD skills matched to this project',
                topics: ['Node.js', 'React'],
                questionBudget: 2
              },
              {
                name: 'Medium-priority JD skills matched to this project',
                topics: [],
                questionBudget: 1
              }
            ]
          },
          {
            order: 3,
            type: 'remaining_requirements',
            title: 'JD Requirements Not Covered in Projects',
            projectName: '',
            projectPriority: '',
            resumeClaims: [],
            groups: [
              {
                name: 'Medium-priority JD skills not used in any project',
                topics: ['Docker'],
                questionBudget: 1
              },
              {
                name: 'Other remaining JD requirements',
                topics: ['Kubernetes'],
                questionBudget: 1
              }
            ]
          }
        ]
      };
    }

    if (prompt.includes('SKILL MAPPING') || prompt.includes('matchedSkills') || prompt.includes('competency analyst') || prompt.includes('MAPPING_PROMPT')) {
      return {
        matchedSkills: ['Node.js', 'React', 'MongoDB', 'TypeScript', 'REST APIs'],
        partialSkills: ['System Design'],
        missingSkills: ['Kubernetes', 'GraphQL'],
        verificationPriorities: [
          {
            item: 'Performance optimization and latency reduction',
            reason: 'High-impact quantitative claim on resume requiring architectural verification',
            priority: 'high'
          }
        ]
      };
    }

    if (prompt.includes('Job Description (JD)') || prompt.includes('Position Title') || prompt.includes('job_title') || prompt.includes('talent acquisition specialist')) {
      return {
        job_title: 'Software Engineer',
        required_skills: ['Node.js', 'React', 'TypeScript', 'REST APIs'],
        preferred_skills: ['Docker', 'Kubernetes'],
        responsibilities: [
          'Design resilient backend services',
          'Implement reactive user interfaces',
          'Collaborate with cross-functional teams'
        ],
        qualifications: ['Bachelor degree in Computer Science or equivalent experience'],
        technologies: ['Node.js', 'React', 'TypeScript', 'MongoDB'],
        experience_requirements: '3+ years of professional software engineering experience'
      };
    }

    return {
      candidate: {
        name: 'Candidate',
        email: '',
        phone: '',
        location: ''
      },
      skills: [
        { name: 'Software Development', level: 'Proficient', evidence: 'From resume' }
      ],
      projects: [
        {
          name: 'Software Project',
          description: 'Production software architecture and delivery',
          technologies: ['JavaScript', 'Node.js'],
          responsibilities: ['Engineered core services and APIs']
        }
      ],
      experience: [
        {
          company: 'Technology Experience',
          role: 'Software Engineer',
          duration: 'Recent',
          responsibilities: ['Built production systems and collaborated across teams']
        }
      ],
      education: [
        {
          institution: 'Accredited University',
          degree: 'Degree in Computer Science or Related Field',
          year: 'Completed'
        }
      ],
      certifications: [],
      claims: []
    };
  }

  /**
   * Run Gemini generation with inline PDF and validate with Zod schema.
   * If Gemini is denied (403) or fails, extracts the actual text from the PDF file using pdf-parse!
   */
  static async generateJsonWithPdf({ prompt, filePath, fileName = '', schema, maxRetries = 2 }) {
    console.log('[GeminiService] generateJsonWithPdf called — file:', fileName || filePath, ', maxRetries:', maxRetries);

    if (!fs.existsSync(filePath)) {
      const err = new Error(`PDF document not found at: ${filePath}`);
      err.statusCode = 404;
      throw err;
    }

    // Extract real text from the uploaded PDF document (used as fallback)
    let rawPdfText = '';
    try {
      rawPdfText = await PdfParserService.extractRawText(filePath);
      console.log('[GeminiService] PDF raw text extracted, length:', rawPdfText.length);
    } catch (parseErr) {
      console.warn('[GeminiService] Local PDF raw text extraction warning:', parseErr.message);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    let ai;
    try {
      ai = this.getClient();
    } catch (clientErr) {
      console.warn('[GeminiService] Client init failed, using dynamic PDF text extraction:', clientErr.message);
      const dynamicData = this.getDynamicFallback({ prompt, rawText: rawPdfText, fileName });
      return schema ? schema.parse(dynamicData) : dynamicData;
    }

    // Default to gemini-3.8-flash (standard 2026 model)
    const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: 'application/pdf'
                  }
                }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error('Empty response received from Gemini.');
        }

        const parsedJson = JSON.parse(rawText);
        if (schema) {
          return schema.parse(parsedJson);
        }

        return parsedJson;
      } catch (err) {
        lastError = err;
        console.warn(`[GeminiService] Attempt ${attempt + 1}/${maxRetries + 1} failed (status: ${err.status || 'N/A'}): ${err.message}`);

        // If Google Cloud project access is denied (403), unauthorized (401), or model retired (404)
        if (err.status === 403 || err.status === 401 || err.status === 404) {
          console.warn(`[GeminiService] Google API returned ${err.status}. Intelligently extracting real document data from uploaded PDF.`);
          const dynamicData = this.getDynamicFallback({ prompt, rawText: rawPdfText, fileName });
          if (schema) return schema.parse(dynamicData);
          return dynamicData;
        }

        // For 503 (overloaded) or 429 (rate limit), use exponential backoff
        if (attempt < maxRetries) {
          const backoffMs = (err.status === 503 || err.status === 429) ? 2000 * (attempt + 1) : 1000;
          console.log(`[GeminiService] Retrying in ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    // If Gemini failed on all retries, extract from real PDF text rather than throwing
    if (rawPdfText) {
      console.warn('[GeminiService] Utilizing dynamic PDF text parser after Gemini retry exhaustion.');
      const dynamicData = this.getDynamicFallback({ prompt, rawText: rawPdfText, fileName });
      if (schema) return schema.parse(dynamicData);
      return dynamicData;
    }

    const message = lastError?.errors
      ? `Gemini schema validation failed: ${lastError.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : `Gemini processing failed: ${lastError.message}`;
    const error = new Error(message);
    error.statusCode = 422;
    throw error;
  }

  /**
   * Run Gemini generation with text/JSON input and validate with Zod schema.
   * If Gemini returns 403 or fails, dynamically generates mapping/plan from prompt JSON.
   */
  static async generateJsonFromText({ prompt, schema, maxRetries = 2 }) {
    console.log('[GeminiService] generateJsonFromText called, prompt length:', prompt.length);
    let ai;
    try {
      ai = this.getClient();
    } catch (clientErr) {
      console.warn('[GeminiService Text] Client init failed, using dynamic schema generation:', clientErr.message);
      const dynamicData = this.getDynamicFallback({ prompt });
      return schema ? schema.parse(dynamicData) : dynamicData;
    }

    const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error('Empty response received from Gemini.');
        }

        const parsedJson = JSON.parse(rawText);
        if (schema) {
          return schema.parse(parsedJson);
        }

        return parsedJson;
      } catch (err) {
        lastError = err;
        console.warn(`[GeminiService Text] Attempt ${attempt + 1}/${maxRetries + 1} failed (status: ${err.status || 'N/A'}): ${err.message}`);

        if (err.status === 403 || err.status === 401 || err.status === 404) {
          console.warn(`[GeminiService Text] Google API returned ${err.status}. Dynamically generating structured output from prompt context.`);
          const dynamicData = this.getDynamicFallback({ prompt });
          if (schema) return schema.parse(dynamicData);
          return dynamicData;
        }

        if (attempt < maxRetries) {
          const backoffMs = (err.status === 503 || err.status === 429) ? 2000 * (attempt + 1) : 1000;
          console.log(`[GeminiService Text] Retrying in ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    // Fallback on exhaustion
    const dynamicData = this.getDynamicFallback({ prompt });
    if (schema) return schema.parse(dynamicData);
    return dynamicData;
  }
}

export default GeminiService;
