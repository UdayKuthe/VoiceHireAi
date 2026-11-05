export const RESUME_EXTRACTION_PROMPT = `
You are an expert technical recruiter and resume analyzer.
Analyze the attached resume PDF document and extract structured candidate data strictly matching the requested JSON format.

CRITICAL INSTRUCTIONS:
1. Extract only what is stated in the document; do not infer, assume, or invent details.
2. Use empty strings or empty arrays if any field is not mentioned in the resume.
3. For "skills":
   - Deduplicate similar or overlapping skill names. Do not include both an acronym and full phrase or sub-variant (e.g. do not output both "LoRA" and "LoRA Finetuning" - use "LoRA Fine-tuning"; do not output both "HuggingFace" and "HuggingFace Transformers" - use "HuggingFace Transformers"; do not output both "DSA" and "Data Structures and Algorithms" - use "Data Structures and Algorithms (DSA)").
   - Set "level" to an empty string ("") for all skills. Do not add tags like "Advanced" or "Proficient".
4. For "experience":
   - Read experience strictly and only from the resume's explicit work-experience section (headings such as Experience, Work Experience, Employment, Professional Experience).
   - If that section is empty or absent, return experience: [].
   - NEVER copy projects, academic work, certifications, or open-source work into "experience". Project extraction stays completely separate under "projects".
   - Do NOT infer experience from projects or skills.
   - Return one entry per employer or job position block:
     * "company": Employer or company name ONLY. Do NOT include bullet points, dates, roles, or section headings in the company name.
     * "role": Job title or position (e.g. "Frontend Developer Intern", "Software Engineer"). A line in italics or directly under a company name is the role, NOT a separate company.
     * "startDate": Start date exactly as written in the resume (e.g., "May 2025", "05/2025", "2020"). Leave empty ("") if missing. Dates must NEVER be placed in the "company" field.
     * "endDate": End date exactly as written in the resume (e.g., "June 2025", "Dec 2023", "Present"). Leave empty ("") if missing.
     * "isCurrent": Boolean, true if the candidate currently works at this employer.
     * "durationText": Explicit duration string stated in the resume, if any (e.g., "2 yrs 3 mos", "1.5 years", "6 months"). Leave empty ("") if absent.
     * "sourceText": Exact excerpt from the resume text documenting this employment entry for grounding.
     * "page": Page number where this company appears (starting at 1).
   - A section heading ("Experience", "Professional Experience", "Work Experience", "Employment") is NEVER a company name. If a section heading appears with no jobs under it, return experience: [].
   - Technologies, responsibilities, and achievements belong to the project or candidate profile; do NOT extract them into experience.
5. For "claims":
   - Extract major project technical claims, quantitative metrics, and architectural achievements (e.g., benchmark results like ROUGE/BERTScore, latency reductions, 4-bit quantization, parallel pipelines, multimodal fusion modules, API throughput, user scale).
   - Also include key academic and professional achievements or honors (e.g., top university CGPA/rankings, major professional certifications).
   - Do NOT extract high school or secondary board exam marks/percentages (such as 10th/12th grade, CBSE, SSC, HSC, Junior College).
   - Attribute each claim to its "relatedProject" (or "Achievements & Certifications") and "relatedSkill".
6. Output MUST be valid JSON adhering strictly to this structure:
{
  "candidate": {
    "name": "Full Name",
    "email": "Email address",
    "phone": "Phone number",
    "location": "City, Country or State"
  },
  "skills": [
    {
      "name": "Clean Canonical Skill Name",
      "level": "",
      "evidence": "Where or how this skill was applied in the document"
    }
  ],
  "projects": [
    {
      "name": "Project Title",
      "description": "Short factual summary of what the project did",
      "technologies": ["Tech 1", "Tech 2"],
      "responsibilities": ["Specific contribution 1", "Specific contribution 2"]
    }
  ],
  "experience": [
    {
      "company": "Employer Name",
      "role": "Job Title",
      "startDate": "Start date as written",
      "endDate": "End date as written",
      "isCurrent": false,
      "durationText": "Stated duration if any",
      "sourceText": "Grounding excerpt",
      "page": 1
    }
  ],
  "education": [
    {
      "institution": "University / College",
      "degree": "Degree and Major",
      "year": "Graduation year or dates"
    }
  ],
  "certifications": [
    "Certification Name"
  ],
  "claims": [
    {
      "text": "Specific technical metric, project claim, or achievement",
      "relatedSkill": "Associated skill or tool",
      "relatedProject": "Associated project or role"
    }
  ]
}
`;

export default RESUME_EXTRACTION_PROMPT;
