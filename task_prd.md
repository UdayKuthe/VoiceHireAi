# AGENT TASK: VoiceHire AI — Phase 2 (Resume/JD Extraction & Interview Planning)

Extend the existing Phase 1 codebase. No Redis, LiveKit, STT, TTS, RAG, embeddings or vector DB. Local dev only.

## Assumptions
- Gemini model name is read from env (`GEMINI_MODEL`); use the official `@google/genai` SDK with the PDF sent as inline data (<20MB) or the Files API (larger).
- Extraction, mapping and planning are triggered per Interview (resume + JD attach to an interview).
- Endpoints below are proposed (the PRD has no API spec).

## Env
- server/.env add: GOOGLE_GEMINI_API_KEY, GEMINI_MODEL, UPLOAD_DIR=./uploads, MAX_UPLOAD_MB=10
- Add `uploads/` to `.gitignore`. Key is server-side only.

## Hard Rules
- PDF goes straight to Gemini. **No OCR, spaCy, SkillNER or keyword extraction.**
- Request JSON output (`responseMimeType: application/json` + response schema). Validate with zod/ajv; on invalid output retry once, then return a specific error.
- Use `multer` with a PDF-only filter (mime + extension) and a size limit. Store files in `UPLOAD_DIR` under random names.
- Uploaded files are never publicly served; never put PDFs in Redis. Delete the temp file after successful extraction (keep metadata in Mongo).
- Recruiters access only their own interviews and candidates.

## Data Models (Mongoose)
Resume: interviewId, candidateId, fileName, uploadedAt, status (`uploaded|processing|extracted|failed`), error?, data, editedByRecruiter (bool)
- data: `{candidate:{name,email,phone,location}, skills:[{name,level?,evidence?}], projects:[{name,description,technologies[],responsibilities[]}], experience:[{company,role,duration,responsibilities[]}], education:[], certifications:[], claims:[{text,relatedSkill?,relatedProject?}]}`

JD: interviewId, fileName, uploadedAt, status, error?, data, editedByRecruiter
- data: `{job_title, required_skills[], preferred_skills[], responsibilities[], qualifications[], technologies[], experience_requirements}`

Mapping: interviewId, matchedSkills[], partialSkills[], missingSkills[], verificationPriorities[{item, reason, priority}], createdAt

InterviewPlan: interviewId, items[{order, category, topic, reason, priority, relatedProject?}], createdAt
- category enum, in this order: `project`, `jd_technology`, `claim_verification`, `remaining_jd_requirement`, `other_resume_skill`
- Plan is a guide, not a script.

Add to Interview: `resumeId`, `jdId`, `analysisStatus` (`none|extracting|mapped|planned|failed`).

## API (/api, RECRUITER role + ownership checks)
- POST /interviews/:id/resume (multipart `file`)
- POST /interviews/:id/jd (multipart `file`)
- POST /interviews/:id/extract → runs Gemini extraction for resume and JD (parallel), saves validated JSON
- POST /interviews/:id/map → Resume–JD mapping via Gemini (input: stored JSON, not PDFs)
- POST /interviews/:id/plan → generates the plan via Gemini from resume + JD + mapping
- GET /interviews/:id/analysis → {resume, jd, mapping, plan, analysisStatus}
- PATCH /interviews/:id/resume/data and /jd/data → recruiter corrections (validate against the same schema; set editedByRecruiter=true)
- PATCH /interviews/:id/plan → reorder/edit/remove plan items

Re-running map/plan after edits must overwrite the old results.

## Services (modular)
`services/gemini.service.js` (client + retry), `services/resumeExtraction.service.js`, `services/jdExtraction.service.js`, `services/mapping.service.js`, `services/planning.service.js`; prompts in `prompts/*.js`; schemas in `schemas/*.js`.

## Prompts
- Resume: extract candidate info, education, skills, projects, technologies, experience, responsibilities, certifications, claims. "Extract only what is stated in the document; do not infer or invent. Use empty values if absent."
- JD: extract job title, required skills, preferred skills, responsibilities, qualifications, technologies, experience requirements. Same no-invention rule.
- Mapping: input resumeData + jdData; output matched, partial and missing skills plus verification priorities (claims needing verification, high-priority topics).
- Planning: output items in the category order above, with reasons. Projects first.

## Frontend
- Interview detail page (recruiter): steps Upload → Analysis → Mapping → Plan
- Two upload dropzones (resume, JD): PDF-only validation, progress, replace file
- "Analyze" button → processing indicator/skeleton; poll `analysisStatus`
- Review screen with tabs: Resume Data | JD Requirements | Mapping | Plan
  - Editable fields for extracted values (inline edit, save, "edited" badge)
  - Mapping shown as matched / partial / missing groups
  - Plan as an ordered list; drag-to-reorder or up/down; remove item
- "Regenerate Mapping & Plan" button after edits
- Specific errors, e.g. "Unable to process the resume PDF. Please upload a readable PDF and try again."

## Constraints
- Do not touch Phase 1 auth/status logic beyond adding the fields above
- Don't read or refactor unrelated files
- No interview-time or live-state code

## Done when
1. Recruiter uploads a resume PDF and a JD PDF to an interview; non-PDF/oversized files are rejected with a specific message
2. Extract returns schema-valid JSON stored in Mongo; invalid output is retried once, then fails clearly
3. Review screen shows the resume, JD, mapping and plan; recruiter edits persist and set `editedByRecruiter`
4. Mapping and plan are saved to Mongo; the plan follows the required category order
5. No code path uses OCR/NLP keyword extraction; no API key in the client; PDFs not publicly accessible

## Process
List the new files first, then implement backend → frontend. Test with one sample resume and one sample JD. Edit existing code with minimal diffs; do not read unrelated files.