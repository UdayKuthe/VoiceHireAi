# VoiceHire AI — Final Product Requirements Document (PRD)

**Document Version:** 1.4  
**Product:** VoiceHire AI  
**Product Type:** AI-powered web application  
**Primary Users:** Recruiters / Interviewers and Candidates  
**Current Scope:** Local development; deployment is out of scope for the current version  
**Project Condition:** Phase 1 (Completed & Tested ✓) | Phase 2 (Completed & Tested ✓) | Phase 3 (Completed & Verified ✓ — Steps S0–S12 100% PASS)

---

## Current Project Status & Implementation Snapshot

| Phase | Component | Status | Key Implemented Features |
|---|---|---|---|
| **Phase 1** | Auth, Dashboards & Lifecycle | **COMPLETE ✓** | JWT + bcrypt auth, single-session concurrency enforcement, password reset token flow, dual recruiter/candidate dashboards, interview scheduling lifecycle (`draft` → `scheduled` → `reminder` → `recruiter_ready` → `live` → `completed`), readiness gating preventing early candidate join. |
| **Phase 2** | LLM PDF Extraction | **COMPLETE ✓** | Gemini multimodal direct PDF parsing with resilient fallback to PDF text parser (`pdf-parse`); deduplicated canonical skills, structured projects (tech + responsibilities), education, certifications, and quantitative claims with project/skill attribution. |
| **Phase 2** | Simplified Experience Engine | **COMPLETE ✓** | Dedicated company and years extraction; automated sanitization (strips bullets/symbols, extracts embedded dates, drops section headings like "Professional Experience", merges orphan role rows); inclusive end-month duration ($\text{months} = (y_2 - y_1) \times 12 + (m_2 - m_1) + 1$, $\text{years} = \text{months} / 12$ with 2-decimal precision); year-only ranges with warnings; total years sum across entries; auto-derived experience level (`fresher` <1y, `junior` 1–<3y, `mid` 3–<6y, `senior` 6y+); JD experience gap calculation (`relevantYears` deprecated); inline recruiter editing with auto-recomputation. |
| **Phase 2** | Resume–JD Mapping | **COMPLETE ✓** | Matched, partial, and missing skills comparison; JD requirement alignment; project priority ranking (`HIGH`, `MEDIUM`, `LOW`) based on JD relevance; recruiter override support for experience level and project priorities. |
| **Phase 2** | Project-First Interview Plan | **COMPLETE ✓** | Section 1 (Intro, 5 min); Sections 2..N (one section per candidate project strictly ordered `HIGH` → `MEDIUM` → `LOW`, each with 3 mandatory groups: Architecture & Design, Implementation & Trade-offs, Edge Cases & Lessons); level-calibrated hidden `baseDifficulty` and `focusAreas`; final section for Remaining JD Requirements; instant plan regeneration upon upstream edits. |
| **Phase 3** | S0–S4 State, Engine & Provider Chain | **COMPLETE ✓** | External API preflight; Zod schemas (`redis.schema.js`); live routes (`/token`, `/consent`, `/start`, `/end`, `/live-state`, `/report`); deterministic progression engine; Groq gpt-oss primary (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`) with Gemini (`gemini-3.5-flash-lite`) fallback; batched question pregen at `/start`; TPM/TPD guards; Jaccard duplicate avoidance. |
| **Phase 3** | S5–S12 Voice Loop, UI & Hardening | **COMPLETE ✓** | Text dry-run (S5); finalization idempotency & Mongo report (S6); Deepgram 16kHz STT & TurnManager (S7); Deepgram 24kHz TTS & cancel queue (S8); LiveKit in-process bot audio loop with barge-in & D6 latency tracking (S9); Candidate LiveInterviewPage & Recruiter Observer Panel (S10); Master E2E acceptance suite & failure hardening (S11); Docs sync & changelog (S12). |

## 1. Product Overview

VoiceHire AI is a real-time, voice-based adaptive interview system that uses a candidate's resume, job description (JD), and previous interview responses to conduct a personalized interview.

The core idea is to treat the interview as a continuously updated evidence-acquisition process. The system maintains a structured interview state containing resume skills, resume claims, job requirements, previous questions and answers, demonstrated evidence, verification status, and unresolved evidence gaps. The next question is selected using this evolving state rather than only following a fixed question list.

### Core Product Loop

```text
Resume + JD
    ↓
LLM-based PDF Analysis
    ↓
Resume / JD Structured Data
    ↓
Resume–JD Mapping
    ↓
Interview Plan
    ↓
Real-Time Voice Interview
    ↓
Speech-to-Text
    ↓
Answer + Evidence Analysis
    ↓
Update Interview State
    ↓
Evidence Gap Detection
    ↓
Adaptive Question Selection
    ↓
Text-to-Speech
    ↓
Candidate
    ↺
```

---

## 2. Product Goals

### Primary Goals

- Provide separate, purpose-built dashboards for recruiters and candidates.
- Analyze resumes and JDs directly from PDF files using an LLM.
- Generate structured candidate and job information without using rule-based/NLP skill extraction.
- Create an interview plan based on projects, JD requirements, and resume claims.
- Conduct a real-time voice interview.
- Maintain a live candidate evidence state during the interview.
- Dynamically select relevant follow-up questions from the current state.
- Verify important resume claims and job-relevant skills.
- Produce a structured final interview assessment.

### Non-Goals for the Current Version

- Production deployment and cloud infrastructure.
- RAG/vector database integration.
- Automated hiring or rejection decisions.
- Full ATS/recruitment management functionality.
- Automated background verification.
- Salary negotiation.
- Advanced video emotion/facial analysis.
- Multi-user collaborative editing.

---

## 3. Target Users

### 3.1 Recruiter / Interviewer

Uses the recruiter dashboard to:

- Create and manage interviews.
- Upload candidate resumes and JDs.
- Review extracted information.
- Configure or review interview plans.
- Schedule or prepare interviews.
- Start/mark interview availability.
- Review completed interview reports.

### 3.2 Candidate

Uses the candidate dashboard to:

- View interview status.
- View upcoming interview date/time when applicable.
- See an interview-ready/active state.
- Join the interview.
- Give real-time voice responses.
- Complete the interview session.

---

## 4. System Scope

### In Scope

- Recruiter dashboard
- Candidate dashboard
- Authentication
- Role-based access
- Basic recruiter-candidate interaction
- Interview availability / scheduling state / reminder display
- Resume PDF upload
- JD PDF upload
- Direct LLM-based PDF analysis
- Resume skill/project/claim extraction
- JD requirement extraction
- Resume–JD mapping
- Interview planning
- Real-time voice interview
- Speech-to-text
- Answer analysis
- Evidence tracking
- Interview state management
- Adaptive question generation/selection
- Text-to-speech
- Interview history
- Assessment report

### Current Out of Scope

- Deployment
- RAG
- Vector database
- Payment/subscription system
- Complex enterprise permissions
- Full ATS functionality
- Candidate ranking for automatic hiring decisions

---

## 5. Product Architecture Principles

### 5.1 LLM-First Document Extraction

Resume and JD PDFs are sent directly to the selected multimodal LLM for document understanding and structured extraction.

The system will **not use a separate NLP skill-extraction pipeline** for the core resume/JD extraction process.

### 5.2 MongoDB as Persistent Application Storage

MongoDB stores durable application data such as:

- Users
- Candidate profiles
- Resume metadata and extracted resume data
- JD metadata and extracted JD data
- Interviews
- Interview questions
- Interview answers
- Evidence records
- Skill states
- Claim verification results
- Final assessment reports
- Interview schedules/reminders

### 5.3 Redis as Active Interview State

Redis stores the current, rapidly changing interview state.

The active state may include:

- Candidate identity/context
- Resume skills relevant to the interview
- Resume claims
- JD requirements relevant to the interview
- Current project
- Current skill status
- Current evidence
- Evidence gaps
- Recent questions
- Recent answers
- Current question
- Interview phase
- Interview timer/status

MongoDB remains the persistent source of truth. Redis is the fast working state for the active interview. At interview completion, the final state is persisted back to MongoDB.

### 5.4 No RAG in Current Version

The project will **not use embeddings, vector databases, or a RAG retrieval pipeline at this stage**.

The LLM receives the structured context needed for the current task from MongoDB and/or the active Redis interview state.

RAG may be considered in a future version only if the context size and retrieval requirements justify it.

---

# 6. Product Information Architecture

## 6.1 Public / Entry Screens

```text
Landing
Login
Register
Forgot Password
```

## 6.2 Recruiter Application

```text
Recruiter Dashboard
    ├── Candidates
    ├── Interviews
    ├── Create Interview
    ├── Interview Reports
    └── Settings
```

## 6.3 Candidate Application

```text
Candidate Dashboard
    ├── Profile
    ├── Upcoming Interviews
    ├── Interview Status
    ├── Join Interview
    └── Interview History
```

## 6.4 Interview Workspace

```text
Interview Setup
    ↓
Document Analysis
    ↓
Resume–JD Mapping
    ↓
Interview Planning
    ↓
Live Interview
    ↓
Assessment Report
```

---

# 7. Phase-Wise Product Scope & Status

The product roadmap consists of three major phases:

## Phase 1 — Dashboards, Authentication & Basic Interaction [COMPLETED ✓]

### Objective
Build the application foundation, role authentication, candidate management, and readiness interaction before introducing AI intelligence.

### Completed Features & Implementation Details

- **Secure Authentication & Session Management**:
  - Registration, login, logout with JWT and bcrypt.
  - Role-based access control (`RECRUITER` vs. `CANDIDATE`).
  - **Single-Session Concurrency Prevention**: User sessions track active session tokens to reject concurrent logins from secondary windows/browsers (`409 Conflict`).
  - **Password Reset Flow**: Secure token generation via console URL, password reset endpoint, and token invalidation upon change.
- **Recruiter Dashboard**:
  - Candidate management (listing, profile view).
  - Interview creation shell and schedule configuration (`scheduledAt`).
  - Real-time interview readiness toggle (`recruiterReady: true/false`).
  - Full interview lifecycle management (`draft` → `scheduled` → `reminder` → `recruiter_ready` → `live` → `completed`).
- **Candidate Dashboard**:
  - Upcoming interview schedule and countdown reminder.
  - Active interview status polling.
  - **Gated Join Interaction**: Early join is strictly prevented (`400 Bad Request`) until the recruiter explicitly marks readiness. When recruiter marks ready, candidate UI unlocks `Join Interview`.
- **Automated Verification**: Verified via `backend/test_phase1.js` (100% pass rate).

---

## Phase 2 — Resume/JD Extraction & Interview Planning [COMPLETED ✓]

### Objective
Convert uploaded resume and JD PDFs into verified structured JSON, map competencies against job requirements, calculate experience accurately, and generate a project-first interview plan.

### Completed Features & Implementation Details

- **Multer PDF Upload Pipeline**:
  - Strict mime/extension validation rejecting non-PDF documents (`400 Bad Request`).
  - Temporary local storage in `uploads/` for processing.
- **Multimodal LLM Document Extraction (Gemini API)**:
  - Direct PDF byte transmission to Google Gemini (`gemini-2.5-flash` / `gemini-3.8-flash`) without intermediate OCR/NLP pipelines.
  - **Dynamic Fallback Engine**: Resilient fallback to local PDF text parser (`pdf-parse`) and structured parser when Gemini free-tier rate limits or 429 quota exhaustion occur.
  - Structured extraction of deduplicated canonical skills (no arbitrary levels/sub-variants), projects with technologies and specific contributions, education, certifications, and quantitative claims attributed to projects/skills.
- **Simplified & Sanitized Experience Section (Company and Years)**:
  - Extracted experience focuses strictly on `company` and `years` per entry from the explicit work-experience section.
  - **Server-Side Sanitization**: Automatically strips bullets (`•`, `*`, `\u2022`), extracts and removes dates embedded in company names, drops section headings ("Professional Experience", "Work History", etc.), and merges orphan role rows into the preceding employer row.
  - **Inclusive End-Month Duration**: $\text{months} = (y_2 - y_1) \times 12 + (m_2 - m_1) + 1$, $\text{years} = \text{months} / 12$ with 2-decimal precision (e.g. May 2025 to June 2025 = 2 months = 0.17 yrs). Current jobs compute duration up to the current month.
  - **Year-Only Ranges**: Computes year difference with `"Approximate: dates have no months"` warning; identical years leave years empty (`null`) with `"Same year without months; duration indeterminate"`.
  - **Summary Metrics**: `totalYears` is the sum of entries (2 decimals). `experienceLevel` is derived automatically:
    - `< 1.0` yrs: `fresher` (empty experience gives 0 yrs and level `fresher` with no warning banner).
    - `1.0` to `< 3.0` yrs: `junior`.
    - `3.0` to `< 6.0` yrs: `mid`.
    - `6.0+` yrs: `senior`.
    - Entries exist but none parseable: `years: null`, level defaults to `fresher` with row warning and recruiter override banner.
  - `jdExperienceGap`: Compares JD required years directly vs `totalYears` (`relevantYears` deprecated and removed).
- **Competency Mapping & Project Priority Ranking**:
  - Matched, partial, and missing skills comparison against JD requirements.
  - Automated project priority scoring (`HIGH`, `MEDIUM`, `LOW`) based on relevance to JD core competencies.
  - Recruiter override support for both candidate Experience Level and Project Priority.
- **Project-First 3-Group Interview Plan**:
  - **Section 1**: Introduction & Context (5 min).
  - **Sections 2..N**: One section per candidate project, strictly ordered `HIGH` → `MEDIUM` → `LOW` priority.
    - Each project section contains exactly 3 mandatory groups:
      1. Architecture & Design
      2. Implementation & Technical Trade-offs
      3. Edge Cases & Operational Lessons
    - Hidden level-calibrated `baseDifficulty` (`easy`, `medium`, `hard`) and `focusAreas` tailored to the candidate's experience level.
  - **Final Section**: Remaining JD Requirements.
  - Instant plan regeneration upon resume, JD, project priority, or experience level updates.
- **Recruiter Review Workspace**:
  - Multi-tab UI: Overview, Resume Data, JD Data, Skill Mapping, and Interview Plan.
  - Compact experience rows with editable company (text), editable years (step 0.01), read-only duration caption (e.g. `"May 2025 – June 2025 · 2 months"`), and re-extract trigger.
- **Automated Verification**: Verified via `backend/test_phase2.js` and `backend/test_experience_prd.js` (100% pass rate).

---

## Phase 3 — Real-Time Voice Interview & State Management [READY FOR IMPLEMENTATION]

### Objective
Conduct the live adaptive voice interview using LiveKit, Deepgram streaming STT/TTS, and a Redis working-state engine that analyzes candidate answers, tracks evidence, detects evidence gaps, and adaptively selects follow-up questions.

### Architecture & Groundwork Completed

- **Redis Active State Schema Implemented**:
  - Implemented in `backend/src/schemas/redis.schema.js` and validated with Zod.
  - Seamlessly bridges Phase 2 data models to Phase 3 runtime state:
    - `candidate_context.experience`: `{ experienceLevel, totalYears, companies: [{ company, years }] }`.
    - `assessment_plan`: loaded with the 3-group project-first sections, `baseDifficulty`, and `focusAreas`.
    - `interview_state`: tracking phase (`intro` → `project` → `requirements` → `wrapup`), active project, active group, question history, answer history, evidence, claims, and evidence gaps.

### Phase 3 Implementation Modules

1. **LiveKit Real-Time Audio Session**:
   - Backend endpoint `POST /api/interviews/:id/token` generates candidate access token using `livekit-server-sdk`.
   - Candidate browser connects to LiveKit room via `livekit-client` / `@livekit/components-react`.
2. **Deepgram Streaming STT**:
   - WebSocket audio streaming from LiveKit room to Deepgram STT.
   - Real-time interim transcripts for feedback; finalized transcripts trigger answer analysis.
3. **Answer & Evidence Analysis**:
   - LLM analyzes candidate response for demonstrated skills, project claims, technical depth, ownership, and gaps.
   - Active Redis state updated: evidence records added, claim verification updated, evidence gaps tagged.
4. **Adaptive Question Selection**:
   - Guided by project priorities (`HIGH` → `MEDIUM` → `LOW`) and 3-group progression (Architecture → Implementation → Edge Cases).
   - Calibrated by candidate experience level (`baseDifficulty` + `focusAreas`).
   - If an answer leaves an evidence gap, an adaptive probing question is generated before moving to the next group.
5. **Deepgram Streaming TTS**:
   - Generated questions are streamed as audio back through the LiveKit room to the candidate.
6. **Completion & MongoDB Assessment Report**:
   - At interview finish, final state is persisted to MongoDB `AssessmentReport` with candidate summary, verified claims, evaluated skills, and question/answer transcripts.

---

# 8. Functional Requirements

## FR-01 Authentication

The system shall support:

- Registration
- Login
- Logout
- Password reset
- Role-based access

## FR-02 Role-Based Dashboard

After authentication:

- Recruiters shall be routed to the Recruiter Dashboard.
- Candidates shall be routed to the Candidate Dashboard.
- Users shall not access the other role's protected screens.

## FR-03 Recruiter Dashboard

The recruiter dashboard shall display:

- Candidate list
- Upcoming interviews
- Interview status
- Ready/not-ready state
- Quick action to create an interview
- Completed interview reports

## FR-04 Candidate Dashboard

The candidate dashboard shall display:

- Profile information
- Upcoming interview
- Interview date/time
- Interview status
- Recruiter readiness
- Join interview action when enabled
- Previous interview history where applicable

## FR-05 Interview Scheduling / Reminder State

The system shall support basic interview states such as:

```text
Draft
Scheduled
Reminder
Recruiter Ready
Candidate Ready
Live
Completed
Cancelled
```

The first implementation may use an application-level schedule/reminder state rather than a separate calendar integration.

## FR-06 Resume PDF Upload

Recruiters shall be able to upload a resume PDF for a candidate.

## FR-07 JD PDF Upload

Recruiters shall be able to upload a job description PDF.

## FR-08 LLM-Based PDF Extraction

The system shall send PDF documents directly to the configured multimodal LLM (Gemini API) and request structured JSON extraction, with resilient fallback to local PDF text extraction (`pdf-parse`) upon quota limits.

### Resume Output & Sanitization Schema

```json
{
  "candidate": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string"
  },
  "skills": [
    { "name": "Canonical Skill Name", "level": "", "evidence": "string" }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"],
      "responsibilities": ["string"]
    }
  ],
  "experience": [
    {
      "company": "Clean Employer Name",
      "role": "Job Title (extraction helper, hidden from recruiter UI)",
      "years": 0.17,
      "durationMonths": 2,
      "caption": "May 2025 – June 2025 · 2 months",
      "startDate": "May 2025",
      "endDate": "June 2025",
      "isCurrent": false,
      "durationText": "string",
      "yearsEditedByRecruiter": false,
      "warning": "string",
      "sourceText": "string",
      "page": 1
    }
  ],
  "experienceSummary": {
    "totalYears": 0.17,
    "experienceLevel": "fresher",
    "jdExperienceGap": "+0.17 years (0.17 total vs 0 required)",
    "levelOverriddenByRecruiter": false,
    "warnings": []
  },
  "education": [
    { "institution": "string", "degree": "string", "year": "string" }
  ],
  "certifications": ["string"],
  "claims": [
    {
      "text": "Quantitative metric or achievement claim",
      "relatedSkill": "string",
      "relatedProject": "string"
    }
  ]
}
```

*Sanitization Rules*: Section headings ("Professional Experience", etc.) are dropped. Leading bullets/symbols (`•`, `*`) and dates inside company names are stripped and moved to date fields. Orphan role lines are merged into their employer row.

### JD Output Schema

```json
{
  "job_title": "string",
  "required_skills": ["string"],
  "preferred_skills": ["string"],
  "responsibilities": ["string"],
  "qualifications": ["string"],
  "technologies": ["string"],
  "experience_requirements": "string"
}
```

## FR-09 Resume–JD Mapping & Project Prioritization

The system shall analyze the relationship between candidate data and JD requirements:

- **Competency Match**: Identify `matchedSkills`, `partialSkills`, and `missingSkills`.
- **Project Prioritization**: Evaluate candidate projects against JD requirements and assign a priority (`HIGH`, `MEDIUM`, `LOW`) indicating which project best proves JD-critical skills.
- **Experience Alignment**: Compare JD required years against candidate `totalYears` to compute `jdExperienceGap`.
- **Recruiter Overrides**: Recruiters shall have the ability to override the candidate's derived `experienceLevel` and any project's assigned `priority`.

## FR-10 Structured 3-Group Interview Plan

The system shall generate an interview plan structured specifically for technical evidence acquisition:

```text
Section 1: Introduction (5 min)
    ↓
Sections 2..N: Candidate Projects (Strictly ordered HIGH → MEDIUM → LOW priority)
    ├── Group 1: Architecture & Design
    ├── Group 2: Implementation & Technical Trade-offs
    └── Group 3: Edge Cases & Operational Lessons
    ↓
Final Section: Remaining JD Requirements
```

- Each project section contains exactly the 3 mandatory groups above.
- Plan groups include hidden, level-calibrated attributes:
  - `baseDifficulty`: `easy` (fresher/junior), `medium` (mid), `hard` (senior).
  - `focusAreas`: level-specific technical themes (e.g., syntax/tool proficiency for junior; trade-offs/scalability for senior).
- Recruiter plan UI remains clean, focused, and read-only.
- Plan automatically regenerates when upstream resume, JD, project priority, or experience level is modified.

## FR-11 Real-Time Voice Interview

The system shall support real-time candidate voice interaction using LiveKit WebRTC audio rooms.

## FR-12 Speech-to-Text

Candidate speech shall be transcribed in real time via Deepgram streaming STT WebSocket and finalized after each response.

## FR-13 Answer Analysis

The system shall identify from each finalized candidate response:

- Demonstrated skills and technologies
- Project evidence and candidate ownership/responsibility
- Technical justifications and trade-offs
- Verification status of resume claims
- Uncertainty, contradictions, and missing evidence gaps

## FR-14 Active Interview State (Redis Engine)

The active interview state in Redis shall adhere strictly to the schema defined in `backend/src/schemas/redis.schema.js`:

```json
{
  "candidate_context": {
    "name": "Candidate Name",
    "experience": {
      "experienceLevel": "fresher",
      "totalYears": 0.17,
      "companies": [{ "company": "Cohyve", "years": 0.17 }]
    },
    "skills": [{ "name": "React", "level": "", "evidence": "" }],
    "claims": [{ "text": "Built high-throughput pipeline", "relatedProject": "Core API" }]
  },
  "job_context": {
    "job_title": "Frontend Engineer",
    "required_skills": ["React", "TypeScript"],
    "preferred_skills": ["Tailwind CSS"]
  },
  "assessment_plan": {
    "experienceLevel": "fresher",
    "totalYears": 0.17,
    "sections": [
      {
        "order": 1,
        "type": "project",
        "name": "Project Alpha",
        "priority": "high",
        "groups": [
          { "name": "Architecture & Design", "baseDifficulty": "easy", "focusAreas": ["component structure"] },
          { "name": "Implementation & Technical Trade-offs", "baseDifficulty": "easy", "focusAreas": ["state management"] },
          { "name": "Edge Cases & Operational Lessons", "baseDifficulty": "easy", "focusAreas": ["error handling"] }
        ]
      }
    ]
  },
  "interview_state": {
    "current_phase": "project",
    "current_project": "Project Alpha",
    "current_group": "Architecture & Design",
    "current_question": {},
    "question_history": [],
    "answer_history": [],
    "evidence": [],
    "skill_state": {},
    "claim_verification": {},
    "evidence_gaps": [],
    "remaining_areas": [],
    "interview_status": "active"
  }
}
```

## FR-15 Evidence Tracking

The system shall track whether important information is:

- Not assessed
- Observed
- Partially verified
- Sufficiently verified
- Unverified
- Contradictory

## FR-16 Adaptive Question Generation

The next question shall use:

- Resume context
- JD context
- Interview plan
- Previous questions
- Previous answers
- Skill state
- Resume claims
- Evidence gaps
- Remaining assessment areas

## FR-17 Redundancy Control

The system shall avoid repeating a question when sufficient evidence already exists unless the question is intentionally used for clarification or verification.

## FR-18 Text-to-Speech

Generated questions shall be converted to audio using a streaming TTS capability.

## FR-19 Final Assessment

At completion, the system shall generate a structured report containing:

- Candidate summary
- Skills assessed
- Evidence collected
- Skill status
- Verified/partially verified/unverified claims
- Remaining evidence gaps
- Interview summary
- Question/answer history

---

# 9. Technology Stack

Only one technology is selected for each previously ambiguous area.

| Layer | Selected Technology |
|---|---|
| Frontend | React.js + Vite |
| UI / Styling | Tailwind CSS + shadcn/ui |
| Backend | Node.js + Express.js |
| Real-Time Communication | LiveKit |
| Interview LLM (Primary) | Groq API (`openai/gpt-oss-120b` for analysis & summary, `openai/gpt-oss-20b` for fast probing) |
| Interview LLM (Fallback) | Google Gemini API (`gemini-3.5-flash-lite`) |
| Document Extraction LLM | Google Gemini API (`gemini-3.8-flash`) + `pdf-parse` fallback (Frozen) |
| Speech-to-Text | Deepgram Streaming STT |
| Interview State | Redis |
| Database | MongoDB |
| Text-to-Speech | Deepgram Streaming TTS |
| Authentication | JWT-based application authentication |

### Removed from Current Version

- spaCy / SkillNER for core extraction
- Whisper
- WebRTC as a separately selected product layer
- Vector database
- RAG
- Deployment infrastructure
- AWS / Docker / Kubernetes requirements

LiveKit is selected as the real-time communication layer because it provides realtime voice infrastructure and JavaScript/React support. citeturn377321search2turn377321search4 Deepgram is selected for streaming STT and TTS, both of which expose realtime WebSocket-based APIs. citeturn346258search2turn346258search5 Gemini is selected for direct PDF/document input, which allows local PDF files to be sent as model input without introducing a separate NLP extraction stage. citeturn764600search0

---

# 10. Data Storage Architecture

```text
                    ┌───────────────┐
                    │    MongoDB    │
                    │ Persistent DB │
                    └───────┬───────┘
                            │
                    Candidate / Resume
                    JD / Interview
                    Answers / Evidence
                    Final Reports
                            │
                            │
                    ┌───────▼───────┐
                    │     Redis     │
                    │ Active State  │
                    └───────────────┘

Active Redis state contains the context needed to run
and adapt the current interview.
```

### MongoDB

Persistent data:

- User accounts
- Candidate profiles
- Resume metadata
- Extracted resume JSON
- JD metadata
- Extracted JD JSON
- Interview records
- Question history
- Answer history
- Evidence records
- Skill states
- Claim verification
- Reports

### Redis

Live data:

- Active interview state
- Current phase
- Current question
- Recent transcript/answers
- Resume skills relevant to the interview
- Resume claims relevant to the interview
- JD priorities relevant to the interview
- Current evidence
- Evidence gaps
- Skill states
- Session timing/status

### Important Rule

Raw PDF files should not be placed in Redis. During local development, the uploaded PDFs can be kept temporarily in a local upload directory for LLM processing, while their metadata and extracted structured information are stored in MongoDB. The active interview receives the relevant structured context through Redis.

---

# 11. Recruiter Dashboard Requirements

### Dashboard Sections

- Overview
- Candidates
- Upcoming Interviews
- Active Interviews
- Completed Interviews
- Interview Reports

### Quick Actions

- Add Candidate
- Create Interview
- Upload Resume
- Upload JD
- View Interview

---

# 12. Candidate Dashboard Requirements

### Dashboard Sections

- Profile
- Upcoming Interview
- Interview Status
- Interview Date / Time
- Recruiter Ready State
- Join Interview
- Previous Interviews

### Ready Interaction

Example:

```text
Interview: AI Engineer
Date: 10:30 AM

Recruiter status: Ready ✓

[ Join Interview ]
```

---

# 13. Interview UI / UX Requirements

## Recruiter Experience

The recruiter interface should emphasize:

- Interview status
- Candidate information
- Resume/JD analysis
- Interview plan
- Evidence state
- Interview controls
- Final report

## Candidate Experience

The candidate interface should remain simple and conversation-focused.

```text
┌──────────────────────────────┐
│ VoiceHire AI       10:30 AM  │
├──────────────────────────────┤
│                              │
│      AI is speaking...       │
│                              │
│ "Explain your project..."    │
│                              │
│       🎤 Listening...        │
│                              │
│    [End Interview]           │
└──────────────────────────────┘
```

Avoid exposing internal evidence, confidence calculations, or hidden reasoning to the candidate.

---

# 14. UI / UX Principles

- Clean, professional interview interface.
- Clear visual hierarchy.
- Minimal unnecessary overlays.
- Inline validation and error states.
- Responsive desktop/tablet/mobile layout.
- Keyboard accessibility for recruiter screens.
- Clear voice connection states.
- Skeleton loading and progress indicators where appropriate.
- No unnecessary animation during the interview.
- Candidate interface should minimize distractions.

---

# 15. Error Handling

Errors should be specific and actionable.

Examples:

> "Unable to process the resume PDF. Please upload a readable PDF and try again."

> "Microphone access is required to start the interview."

> "The voice connection was interrupted. Reconnecting..."

> "The interview state could not be saved. Retrying..."

Avoid generic messages such as "Something went wrong."

---

# 16. Security Requirements

- API keys must never be stored in frontend code.
- LLM, STT, TTS, and LiveKit secrets must be stored in server-side environment variables.
- Protected routes must verify authentication.
- Role checks must be enforced server-side.
- Recruiters must only access candidates/interviews they are authorized to view.
- Candidate interview links/session access must be protected.
- Uploaded resumes and JDs must not be publicly exposed.
- Interview transcripts and evidence must be protected as candidate data.
- Sensitive credentials must not be committed to Git.

---

# 17. Environment Configuration

The current project is local-development only, so secrets are kept in local `.env` files.

### Backend `.env`

```bash
PORT=5000

MONGODB_URI=mongodb://127.0.0.1:27017/voicehire
REDIS_URL=redis://127.0.0.1:6379

GOOGLE_GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite

GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL_ANALYSIS=openai/gpt-oss-120b
GROQ_MODEL_FAST=openai/gpt-oss-20b
GROQ_REASONING_EFFORT=low

LLM_TIMEOUT_MS=8000
LLM_COOLDOWN_SECONDS=60

DEEPGRAM_API_KEY=

LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

JWT_SECRET=
```

### Frontend `.env`

Only non-secret browser-safe configuration may be stored here, for example:

```bash
VITE_API_BASE_URL=http://localhost:5000
VITE_LIVEKIT_URL=
```

Never put `DEEPGRAM_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `LIVEKIT_API_SECRET`, or `JWT_SECRET` in the frontend environment.

---

# 18. Non-Functional Requirements

## Performance

- Resume/JD extraction should provide clear processing feedback.
- Live interview response latency should be minimized.
- STT and TTS should use streaming capabilities.
- Active interview state should be read/written quickly.

## Reliability

- Interview state should be persisted.
- Redis state should be recoverable from MongoDB where practical.
- Final interview data must be saved to MongoDB.

## Maintainability

- Modular backend services.
- Reusable frontend components.
- Clear separation between document processing, interview state, voice processing, and assessment logic.
- Centralized environment configuration.

---

# 19. Feature Priority

## P0 — Phase 1

- Authentication
- Recruiter dashboard
- Candidate dashboard
- Role-based access
- Candidate management
- Interview creation shell
- Interview status
- Schedule/date/time
- Reminder/status display
- Recruiter ready state
- Candidate ready/join state

## P1 — Phase 2

- Resume upload
- JD upload
- Direct LLM PDF extraction
- Structured resume extraction
- Structured JD extraction
- Resume–JD mapping
- Interview planning
- Extracted-data review UI

## P2 — Phase 3

- LiveKit voice interview
- Deepgram streaming STT
- Answer analysis
- Redis interview state
- Evidence tracking
- Claim verification
- Evidence-gap detection
- Adaptive question generation
- Deepgram streaming TTS
- Final assessment report

---

# 20. Acceptance Criteria & Verification Status

## Phase 1 [VERIFIED & PASSED ✓]

- Recruiter registration and login work with secure JWT and bcrypt.
- Candidate authentication and dashboard access work with role guards.
- Concurrent login attempts from secondary windows are blocked (`409 Conflict`).
- Password reset token flow functions securely.
- Recruiter and candidate see isolated, role-specific dashboards.
- Recruiter can create an interview record, schedule time, and toggle readiness.
- Candidate dashboard displays upcoming schedule and readiness countdown.
- Candidate join button is strictly gated until recruiter marks readiness (`400 Bad Request` on early join attempt).

## Phase 2 [VERIFIED & PASSED ✓]

- Recruiter can upload resume PDF and JD PDF with strict mime validation.
- Gemini directly processes PDFs, with resilient fallback to `pdf-parse` upon quota limits.
- Resume skills, projects, claims, education, and certifications are extracted cleanly.
- Simplified experience section extracts company and years accurately without fake section-heading rows or orphan role rows.
- Inclusive month durations are calculated to 2 decimal places, and current jobs compute up to the current month.
- Overlapping dates produce warnings without altering total years sum.
- `totalYears` and auto-derived `experienceLevel` update dynamically on recruiter edits, adds, or deletions.
- Resume–JD mapping identifies matched, partial, and missing skills.
- Candidate projects are assigned priority scores (`HIGH`, `MEDIUM`, `LOW`) based on JD alignment.
- Interview plan strictly follows the 3-group project-first architecture with level-calibrated difficulty and focus areas.
- Recruiter overrides for experience level and project priority persist and trigger plan regeneration.

## Phase 3 [COMPLETED & VERIFIED ✓ — 100% PASS]

- [x] External API preflight & fail-fast env validation (`backend/scripts/preflight.js`).
- [x] Redis state schema extensions (`question_bank`, `progress`, `consent`, `analysis_queue`) with single-flight mutex lock & Mongo recovery (`backend/src/services/redisState.service.js`).
- [x] Live routes (`/token`, `/consent`, `/start`, `/end`, `/live-state`, `/report`) with LiveKit observer token protection and role guards.
- [x] Deterministic interview progression engine (`backend/src/services/interviewEngine.service.js`) with 3-group hierarchy, high→med→low project sequence, probe cap of 2, skip logic, and level calibration.
- [x] Multi-provider LLM chain with Groq gpt-oss primary (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`) and Gemini (`gemini-3.5-flash-lite`) fallback (`backend/src/services/ai/llmClient.js`).
- [x] Batched question pre-generation at `/start` (first batch awaited, remaining in background spaced ≥10s) with template fallback.
- [x] 60s cooldowns on 429, rolling 60s TPM guard (~7K threshold), and 200K TPD daily counter guard.
- [x] Prompt injection delimiter protection and normalized Jaccard duplicate avoidance (>0.8).
- [x] Candidate joins LiveKit WebRTC audio room using backend-issued access token.
- [x] Candidate speech is transcribed in real-time via Deepgram streaming STT WebSocket (`sttDeepgram.js`, `turnManager.js`).
- [x] Finalized candidate answers are analyzed by the LLM (Groq 120B reasoning model) and update active Redis interview state.
- [x] Evidence records, claim verifications, and skill coverage states are stored in Redis.
- [x] Unresolved evidence gaps dynamically guide the next question selection.
- [x] Deepgram streaming 24kHz linear16 TTS speaks generated questions back to candidate over LiveKit audio with barge-in support (`ttsDeepgram.js`, `voiceSession.js`).
- [x] Completed interview state is persisted to MongoDB (`AssessmentReport` and `InterviewTurn` models) and Redis active key is wiped.
- [x] Candidate UI (`LiveInterviewPage.jsx`) maintains strict privacy boundary (exposes only current question caption and timer; 0 scores/evidence).
- [x] Recruiter Live Observer Panel (`RecruiterObserverPanel.jsx`) polls live-state telemetry every 3 seconds with session termination control.
- [x] Master E2E acceptance suite (`backend/test_phase3.js`) verifies all 7 acceptance criteria and forced failure paths.

---

## Changelog
- **v1.4**: Phase 3 Complete (S0–S12 100% PASS). Finalized LiveKit in-process voice bot, Deepgram STT/TTS pipelines, barge-in detection, Groq gpt-oss reasoning analysis (latency 857ms), candidate privacy UI, recruiter observer panel, and master acceptance suite.
- **v1.3**: Integrated Groq gpt-oss primary models (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`) with Gemini 3.5 fallback; batched pre-generation at `/start`; token guards and quota cooldowns.
- **v1.2**: Simplified Experience Engine PRD enhancements and inclusive month calculation.
- **v1.0**: Initial baseline PRD.

---

# 21. Final Product Definition

VoiceHire AI is a **two-dashboard, LLM-powered, real-time voice interview platform**.

Its central capability is:

> **Convert resume/JD PDFs into structured context, maintain an evolving interview state containing candidate evidence, and use that state to dynamically decide what the interviewer should ask next.**

The current build intentionally keeps the architecture focused: **LLM-based document understanding + MongoDB + Redis + real-time voice**, without adding RAG or deployment infrastructure until they are actually required.
