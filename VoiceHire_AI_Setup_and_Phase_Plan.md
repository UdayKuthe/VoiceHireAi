# VoiceHire AI — Development Setup & Phase Plan

This document covers two things:

1. What must be installed/configured on the development PC before implementation begins.
2. The exact implementation plan for the three development phases.

The current plan is for **local development only**. Deployment is intentionally excluded.

---

# Part A — Development Prerequisites

## 1. Recommended Development Environment

Assumption: Windows 10/11 development PC.

### Required

- Git
- Node.js LTS + npm
- Python 3.x only if a supporting script/service is later needed; the current core extraction architecture does **not** require Python.
- MongoDB Community Server
- MongoDB Shell (`mongosh`)
- Redis-compatible local server
- VS Code or another code editor
- Browser with microphone support, preferably Chrome/Edge

### External Accounts / APIs

- Groq API (GroqCloud console) — Primary Interview Agent LLM (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`)
- Google AI Studio / Gemini API — Extraction (`gemini-3.8-flash`) + Fallback (`gemini-3.5-flash-lite`)
- Deepgram
- LiveKit Cloud / LiveKit project credentials

No AWS, Docker, Kubernetes, or deployment account is required for the current development scope.

---

# 2. Install Git

Git is required for version control.

Official source:
https://git-scm.com/install/windows

Current official Windows installation also supports WinGet:

```powershell
winget install --id Git.Git -e --source winget
```

Verify:

```powershell
git --version
```

The official Git for Windows page provides the Windows installer and WinGet installation route. citeturn346258search4

---

# 3. Install Node.js

Node.js is required for:

- React/Vite frontend
- Express backend
- MongoDB/Redis client packages
- LiveKit JavaScript packages
- General project tooling

Download the current **Node.js LTS** from:

https://nodejs.org/en/download

Verify:

```powershell
node --version
npm --version
```

Use the LTS release rather than the Current release for the project. The official Node download page currently lists an LTS release and its installation options. citeturn764600search10

---

# 4. Install MongoDB Community Server

MongoDB is the persistent database for VoiceHire AI.

Use the official MongoDB Community download/documentation:

https://www.mongodb.com/try/download/community

For Windows, the official installer can install MongoDB Community Server. `mongosh` should be installed separately if it is not included by the selected setup. citeturn764600search7turn764600search2

### Verify

After MongoDB is running:

```powershell
mongosh
```

### Local database

Use a database named:

```text
voicehire
```

Example local URI:

```text
mongodb://127.0.0.1:27017/voicehire
```

### What MongoDB stores

```text
users
candidates
resumes
job_descriptions
interviews
questions
answers
evidence
skill_states
claim_verifications
assessment_reports
```

MongoDB should contain the durable record of the application and completed interview.

---

# 5. Install Redis

Redis is the fast working-state store for the active interview.

It should contain the current interview state rather than large PDF files.

The Redis documentation currently describes Windows support through Memurai and also documents Docker-based Redis Stack installation. Because this project does not require Docker right now, use the Windows-compatible Redis route that fits your machine. citeturn346258search11

### Verify

After installing and starting the Redis-compatible server, verify connectivity using the available Redis CLI/client.

The expected local connection string is:

```text
redis://127.0.0.1:6379
```

### Redis stores

```text
current_phase
current_project
current_question
recent_questions
recent_answers
resume_skills
resume_claims
job_priorities
skill_state
evidence
evidence_gaps
interview_status
```

### Important

Do **not** use Redis as the permanent storage location for raw resumes, PDFs, or the complete historical interview database.

Redis = active working state.  
MongoDB = persistent application data.

---

# 6. Install a Code Editor

Recommended:

**Visual Studio Code**

Recommended extensions:

- ESLint
- Prettier
- JavaScript and TypeScript support
- MongoDB extension (optional)
- GitLens (optional)

The extension list is optional; the editor itself is enough to begin.

---

# 7. Browser Requirements

Use a current browser that supports:

- Microphone permissions
- WebRTC/realtime audio
- WebSocket communication
- Modern JavaScript APIs

Recommended:

- Google Chrome
- Microsoft Edge

The browser will be especially important during Phase 3.

---

# 8. LLM Layer — Groq API (Primary) & Gemini API (Extraction & Fallback)

The project uses a resilient, high-speed multi-provider LLM architecture:

1. **Groq API (Primary for Live Interview Agents)**:
   - High-throughput, low-latency inference using `openai/gpt-oss-120b` (for deep answer analysis and evaluation report summaries) and `openai/gpt-oss-20b` (for fast question probing and pre-generation).
   - Generous free-tier limits: 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD per model.
   - Built-in token guards: rolling 60s TPM (~7K threshold) and 200K TPD daily counters.

2. **Google Gemini API**:
   - **Document Extraction (Phase 2, Frozen)**: Direct PDF multimodal extraction with `gemini-3.8-flash` + dynamic local `pdf-parse` fallback on quota exhaustion.
   - **Interview Fallback (Phase 3)**: Automatic failover model `gemini-3.5-flash-lite` if Groq encounters rate limits or cooldowns.

### Store API Keys

Store keys only in `backend/.env`:

```env
GROQ_API_KEY=your_groq_key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL_ANALYSIS=openai/gpt-oss-120b
GROQ_MODEL_FAST=openai/gpt-oss-20b

GOOGLE_GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
```

---

# 9. Deepgram API — Speech-to-Text and Text-to-Speech

Deepgram is the single selected speech provider for this project.

### Use

- Streaming Speech-to-Text
- Streaming Text-to-Speech

Deepgram's current documentation provides realtime streaming STT over WebSocket and streaming TTS over WebSocket. citeturn346258search2turn346258search5

### Get API key

Create a Deepgram account and project through the Deepgram developer platform and create an API key.

Deepgram's streaming guide requires an API key for live transcription. citeturn346258search8

### Store the key

```text
backend/.env
```

```env
DEEPGRAM_API_KEY=your_key_here
```

Never put the secret key in the frontend source code.

### India option

Deepgram currently provides an India endpoint for supported APIs, including streaming STT and TTS, so an India-based deployment can later use the India endpoint when appropriate. This is not required for the local development phase. citeturn346258search10

---

# 10. LiveKit — Real-Time Voice Communication

LiveKit is the selected real-time communication technology.

It provides realtime voice infrastructure and JavaScript/React SDK support. citeturn377321search2turn377321search4

### Get credentials

Create a LiveKit project/account and obtain:

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

### Store credentials

The secret values belong in:

```text
backend/.env
```

Example:

```env
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

The frontend may receive only the browser-safe connection information/token generated by the backend. Do not expose the API secret in the browser.

---

# 11. Backend Packages

Install the packages required by the architecture:

```powershell
npm install express cors dotenv mongoose jsonwebtoken bcryptjs zod multer
npm install ioredis
npm install @google/genai
npm install @deepgram/sdk
npm install livekit-server-sdk
npm install pdf-parse
```

*Note on `pdf-parse`*: Added as a resilient fallback text parser to ensure reliable extraction even when Gemini API free-tier quotas or rate limits occur.

For development:

```powershell
npm install -D nodemon
```

Package versions are pinned in `package-lock.json`.

---

# 12. Frontend Packages

Frontend setup using Vite + React:

```powershell
npm create vite@latest frontend -- --template react
cd frontend
npm install
```

Install UI & routing dependencies:

```powershell
npm install react-router-dom axios
npm install tailwindcss @tailwindcss/vite lucide-react
```

### Required for Phase 3 Live Voice Interview

To establish WebRTC audio streaming rooms in the candidate interface:

```powershell
npm install livekit-client @livekit/components-react
```

This integrates with `livekit-server-sdk` on the backend for room token exchange and microphone audio transport.

---

# 13. Do We Need Python?

### Current answer: No.

The revised architecture removes the need for Python because:

- Resume/JD extraction is done directly by Gemini.
- Backend orchestration is Node.js/Express.
- STT/TTS are external APIs.
- Redis and MongoDB have Node.js clients.
- LiveKit supports JavaScript/React integration.

Python should only be added later if a genuinely Python-specific service is introduced.

---

# 14. Folder Structure Before Coding

Recommended project root:

```text
VoiceHireAI/
│
├── frontend/
│
├── backend/
│
├── uploads/
│   ├── resumes/
│   └── jds/
│
├── docs/
│
├── .gitignore
└── README.md
```

### Backend structure

```text
backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   │   ├── auth/
│   │   ├── extraction/
│   │   ├── interview/
│   │   ├── voice/
│   │   └── assessment/
│   ├── utils/
│   └── app.js
│
├── .env
├── .env.example
└── package.json
```

### Frontend structure

```text
frontend/
├── src/
│   ├── components/
│   ├── pages/
│   │   ├── auth/
│   │   ├── recruiter/
│   │   └── candidate/
│   ├── services/
│   ├── hooks/
│   ├── stores/
│   └── App.jsx
│
├── .env
└── package.json
```

---

# 15. Environment Files

## Backend

Create:

```text
backend/.env
```

Example:

```env
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

Create:

```text
backend/.env.example
```

with empty placeholders only.

## Frontend

Create:

```text
frontend/.env
```

Only public/browser-safe variables:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_LIVEKIT_URL=
```

---

# 16. `.gitignore`

At minimum:

```gitignore
node_modules/
.env
.env.*
!.env.example
uploads/
*.log
```

Never commit real API keys.

---

# Part B — Three-Phase Implementation Plan

# Phase 1 — Dashboards, Authentication & Basic Interaction [STATUS: COMPLETED & VERIFIED ✓]

## Phase 1 Goal

Build the application foundation, role authentication, candidate management, and readiness interaction before adding AI extraction or realtime interviewing.

## 1. Authentication & Security

Implemented:

- Register with name, email, password, and role selection
- Login with JWT generation and bcrypt password hashing
- Logout and session clearing
- Protected route middleware (`authenticateToken`, `requireRole`)
- **Single-Session Concurrency Prevention**: User sessions track active session tokens to reject concurrent logins from secondary windows (`409 Conflict`)
- **Password Reset Flow**: Secure token generation via console URL, password reset endpoint, and token invalidation upon change

Roles:

```text
RECRUITER
CANDIDATE
```

---

## 2. Recruiter Dashboard

Implemented:

- Dashboard layout and candidate list
- Create Interview modal/form
- Upcoming interviews view
- Interview status cards and scheduling (`scheduledAt`)
- Recruiter readiness toggle (`recruiterReady: true/false`)

Example:

```text
Interview: AI Engineer
Candidate: Uday
Time: 10:30 AM
Status: Scheduled

[ Mark Ready ]
```

---

## 3. Candidate Dashboard

Implemented:

- Candidate profile
- Upcoming interview view with date/time
- Active interview status polling
- Recruiter readiness indicator
- **Gated Join Interaction**: Early join is strictly prevented (`400 Bad Request`) until the recruiter explicitly marks readiness. When recruiter marks ready, candidate UI unlocks `Join Interview`.

Example:

```text
AI Engineer Interview
10:30 AM

Recruiter: Ready ✓

[ Join Interview ]
```

---

## 4. Basic Interview State & Lifecycle

MongoDB interview record:

```json
{
  "candidateId": "...",
  "recruiterId": "...",
  "scheduledAt": "...",
  "status": "scheduled",
  "recruiterReady": false,
  "candidateReady": false
}
```

Implemented states:

```text
Draft
Scheduled
Reminder
Recruiter Ready
Candidate Ready
Live
Completed
```

---

## Phase 1 Deliverable & Verification

Automated regression suite: `node backend/test_phase1.js` (100% PASSED ✓).

```text
Recruiter Login
   ↓
Recruiter Dashboard
   ↓
Create & Schedule Interview
   ↓
Recruiter Marks Ready
   ↓
Candidate Dashboard Updates
   ↓
Candidate Joins (Gated until Ready)
```

---

# Phase 2 — Resume/JD Extraction & Interview Planning [STATUS: COMPLETED & VERIFIED ✓]

## Phase 2 Goal

Turn uploaded resume/JD PDFs into structured information, perform competency mapping, derive experience metrics, and create a 3-group project-first interview plan.

---

## 1. Resume Upload

Implemented:

```text
Recruiter Dashboard
      ↓
Candidate Detail View
      ↓
Upload Resume PDF (Multer with mime validation)
      ↓
Temporary local storage (backend/uploads/)
```

---

## 2. JD Upload

Implemented:

```text
Upload JD PDF (Multer with mime validation)
      ↓
Temporary local storage (backend/uploads/)
      ↓
Gemini Direct Processing
```

---

## 3. Direct LLM PDF Extraction

Implemented via Google Gemini API (`@google/genai` with `gemini-2.5-flash` / `gemini-3.8-flash`):

```text
PDF
 ↓
Gemini Direct PDF Ingestion (or dynamic pdf-parse fallback on quota limits)
 ↓
Validated Structured JSON (Zod schema)
```

### Structured Extraction Outputs

- **Candidate Info**: Name, email, phone, location.
- **Skills**: Deduplicated canonical skill names without subjective levels.
- **Projects**: Project title, factual description, technologies used, responsibilities/contributions.
- **Education & Certifications**: Institutions, degrees, graduation dates, and certifications.
- **Quantitative Claims**: High-impact metrics, benchmark scores, or performance claims attributed to specific projects and skills.
- **Simplified Experience Section (Company and Years)**:
  - Focuses strictly on `company` and `years` per entry from the explicit work experience section.
  - **Server-Side Sanitization**: Strips leading bullets (`•`, `*`), extracts embedded date ranges from company names, drops section headings ("Professional Experience"), and merges orphan role lines.
  - **Inclusive Month Duration**: $\text{months} = (y_2 - y_1) \times 12 + (m_2 - m_1) + 1$, $\text{years} = \text{months} / 12$ (rounded to 2 decimals). Current jobs calculate up to today's month.
  - **Year-Only Ranges**: Computes year diff with `"Approximate: dates have no months"` warning; equal years set `years: null` with `"Same year without months; duration indeterminate"`.
  - **Experience Summary**: `totalYears` is the sum of entries (2 decimals). `experienceLevel` is derived automatically (`fresher` <1y, `junior` 1–<3y, `mid` 3–<6y, `senior` 6y+).
  - `jdExperienceGap`: Compares JD required years directly vs `totalYears`.

---

## 4. Save Extraction Result

Structured JSON is stored persistently in MongoDB collections:

- `Resume.data`
- `JobDescription.data`
- Denormalized copies (`experienceLevel`, `totalYears`, `jdExperienceGap`) updated in `Interview`.

---

## 5. Resume–JD Mapping & Project Prioritization

Implemented:

```text
resumeData + jdData
        ↓
    Mapping Service
        ↓
Matched Skills, Partial Skills, Missing Skills
        +
Project Priorities (HIGH, MEDIUM, LOW)
        +
Experience Gap Calculation
```

- Analyzes candidate projects against JD required/preferred skills and assigns `HIGH`, `MEDIUM`, or `LOW` priority based on technical alignment.
- Supports recruiter manual override of candidate `experienceLevel` and project `priority`.
- Persisted in MongoDB `Mapping` collection.

---

## 6. Project-First 3-Group Interview Planning

Generates structured interview sections tailored to candidate depth:

```text
Section 1: Introduction & Context (5 min)
    ↓
Sections 2..N: Candidate Projects (Strictly ordered HIGH → MEDIUM → LOW priority)
    ├── Group 1: Architecture & Design
    ├── Group 2: Implementation & Technical Trade-offs
    └── Group 3: Edge Cases & Operational Lessons
    ↓
Final Section: Remaining JD Requirements
```

- Mandatory 3 groups per project section.
- Calibrated hidden attributes: `baseDifficulty` (`easy`, `medium`, `hard`) and `focusAreas` calibrated to candidate's experience level.
- Saved in MongoDB `InterviewPlan` collection. Automatically regenerates upon upstream edits.

---

## 7. Recruiter Review Workspace

Full 5-tab review interface in `frontend/src/pages/InterviewDetailPage.jsx`:

1. **Overview**: Candidate info, interview details, document status.
2. **Resume Data**: Compact experience rows (editable company text, editable years with 0.01 step, read-only duration caption, warning badges), skills, projects, and re-extract trigger.
3. **JD Data**: Job title, required/preferred skills, responsibilities, experience requirements with inline save.
4. **Skill Mapping**: Matched/partial/missing skills, project priority overrides, experience level override with auto-derived label.
5. **Interview Plan**: Read-only structured 3-group plan with one-click regeneration.

---

## Phase 2 Deliverable & Verification

Automated regression suites:
- `node backend/test_phase2.js` (100% PASSED ✓)
- `node backend/test_experience_prd.js` (100% PASSED ✓)

---

# Phase 3 — Real-Time Voice Interview & State Management [STATUS: COMPLETE & VERIFIED ✓]

## Phase 3 Goal

Build the main research/product contribution: the live adaptive evidence-driven interview.

---

## 1. Create Live Interview State (Redis Engine)

At interview start, initialize active session state in Redis from MongoDB records using `backend/src/schemas/redis.schema.js`:

```text
MongoDB Interview, Resume, Mapping & Plan
        ↓
RedisStateService initialization
        ↓
Redis Active State Key: interview:state:<interviewId>
```

### Verified Redis Schema Structure (Zod Validated)

```json
{
  "candidate_context": {
    "candidateId": "65b...",
    "name": "Alex Rivera",
    "email": "alex@example.com",
    "experience": {
      "experienceLevel": "mid",
      "totalYears": 3.5,
      "companies": [
        { "company": "Innovatech", "years": 1.5 },
        { "company": "Fintech Hub", "years": 2.0 }
      ]
    },
    "skills": [
      { "name": "Node.js", "level": "", "evidence": "" }
    ],
    "projects": [
      {
        "name": "AI Screening Platform",
        "description": "High concurrency voice pipeline",
        "technologies": ["Node.js", "FastAPI"],
        "responsibilities": ["Architecture and deployment"]
      }
    ],
    "claims": [
      { "text": "Handled 10k concurrent streams", "relatedProject": "AI Screening Platform" }
    ]
  },
  "job_context": {
    "job_title": "Senior Backend Engineer",
    "required_skills": ["Node.js", "Microservices"],
    "preferred_skills": ["Docker", "Kubernetes"]
  },
  "assessment_plan": {
    "experienceLevel": "mid",
    "totalYears": 3.5,
    "sections": [
      {
        "order": 1,
        "type": "intro",
        "name": "Introduction & Background",
        "durationMinutes": 5,
        "groups": [
          { "name": "Context & Career Overview", "baseDifficulty": "medium", "focusAreas": ["career progression"] }
        ]
      },
      {
        "order": 2,
        "type": "project",
        "name": "AI Screening Platform",
        "priority": "high",
        "durationMinutes": 15,
        "groups": [
          { "name": "Architecture & Design", "baseDifficulty": "medium", "focusAreas": ["modular design", "system flow"] },
          { "name": "Implementation & Technical Trade-offs", "baseDifficulty": "medium", "focusAreas": ["concurrency trade-offs", "framework selection"] },
          { "name": "Edge Cases & Operational Lessons", "baseDifficulty": "medium", "focusAreas": ["fault tolerance", "error handling"] }
        ]
      },
      {
        "order": 3,
        "type": "requirements",
        "name": "Remaining Job Requirements",
        "durationMinutes": 10,
        "groups": [
          { "name": "JD Alignment & Technical Gaps", "baseDifficulty": "medium", "focusAreas": ["Kubernetes", "Microservices"] }
        ]
      }
    ]
  },
  "interview_state": {
    "current_phase": "intro",
    "current_project": "",
    "current_group": "Context & Career Overview",
    "current_question": null,
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

---

## 2. Real-Time Voice Connection

Use LiveKit for the realtime session.

Flow:

```text
Candidate Browser (livekit-client)
      ↕ WebRTC Audio
LiveKit Cloud / Server
      ↕ Audio Egress / Participant
Interview Backend / Voice Service (livekit-server-sdk)
```

### Compatibility Bridge & Token Generation Endpoint:
- **Endpoint**: `POST /api/interviews/:id/token` (Authenticated, candidate role or recruiter observer).
- **Service**: Generates signed LiveKit JWT using `livekit-server-sdk` `AccessToken`:
  - `apiKey`: `process.env.LIVEKIT_API_KEY`
  - `apiSecret`: `process.env.LIVEKIT_API_SECRET`
  - `identity`: Candidate ID / User ID
  - `metadata`: Candidate Name and Interview Context
  - `grant`: `{ roomJoin: true, room: interviewId, canPublish: true, canSubscribe: true }`
- **Frontend Integration**: Candidate UI (`frontend/src/pages/candidate/LiveInterviewPage.jsx`) installs `livekit-client`, calls the token endpoint upon gated join approval, and connects to `VITE_LIVEKIT_URL`.

---

## 3. Speech-to-Text

Use Deepgram streaming STT.

```text
Candidate Speech
      ↓
LiveKit Audio
      ↓
Deepgram Streaming STT
      ↓
Interim Transcript
      ↓
Final Transcript
```

Only the finalized response should update the authoritative evidence state.

---

## 4. Answer Analysis

After a final answer:

```text
Final Transcript
      ↓
LLM
      ↓
Extract:
- skills
- evidence
- claims
- responsibilities
- uncertainty
- missing information
```

---

## 5. Redis State Update

Update:

```text
skill_state
evidence
resume_claims
claim_verification
evidence_gaps
question_history
answer_history
remaining_areas
```

The updated state becomes the context for the next decision.

---

## 6. Evidence Gap Detection

Example:

```text
Resume Claim:
Implemented Redis caching

Answer:
I integrated Redis into the application.

State:
Redis → Partially Verified

Gap:
What was the candidate's exact implementation responsibility?
```

---

## 7. Next Question Generation & Adaptive Progression

Input to LLM:

```text
Current interview state (Redis: interview:state:<interviewId>)
+ current candidate answer & transcript
+ candidate context (experienceLevel, totalYears, companies, skills, claims)
+ assessment plan (project priority sequence, 3-group hierarchy, focusAreas, baseDifficulty)
+ detected evidence gaps
+ previous question_history & answer_history
```

### Adaptive Question Selection Logic:
1. **Section Sequence**: Introduction → Projects (ordered strictly by `priority`: `HIGH` → `MEDIUM` → `LOW`) → Remaining Job Requirements.
2. **3-Group Progression per Project**:
   - `Group 1: Architecture & Design`: High-level system topology, module boundaries, architectural trade-offs.
   - `Group 2: Implementation & Technical Trade-offs`: Deep technical decisions, library choices, coding challenges.
   - `Group 3: Edge Cases & Operational Lessons`: Failure modes, scaling bottlenecks, operational debugging, post-mortems.
3. **Experience Level Calibration**:
   - `fresher` (<1 yr): Foundational concepts, basic component design, syntax/API usage, guided scenarios.
   - `junior` (1–<3 yrs): Standard design patterns, direct implementation trade-offs, debugging practical bugs.
   - `mid` (3–<6 yrs): System architecture, scalability decisions, concurrency, edge-case mitigation.
   - `senior` (6+ yrs): Large-scale distributed architecture, complex failure domains, cross-cutting concerns, tech strategy.
4. **Gap-Directed Probing**: If an answer produces a partially verified claim or unresolved skill gap, generate a targeted follow-up within the active group before advancing.

Output:

```text
Candidate next question (focused, single question targeted toward the next piece of technical evidence)
```

---

## 8. Text-to-Speech

Use Deepgram streaming TTS:

```text
Generated Question
      ↓
Deepgram TTS
      ↓
Audio Stream
      ↓
LiveKit
      ↓
Candidate
```

---

## 9. Repeat Until Completion

```text
Question
 ↓
Candidate Answer
 ↓
STT
 ↓
Evidence Analysis
 ↓
Redis State Update
 ↓
Evidence Gap
 ↓
Next Question
 ↓
TTS
 ↓
Question
```

Stop when the configured interview duration/assessment coverage is reached or the recruiter ends the interview.

---

## 10. Final Persistence

When the interview ends:

```text
Redis Active State
       ↓
Finalize Interview
       ↓
MongoDB
       ↓
Final Assessment Report
```

The completed state should be persisted so the interview does not depend on Redis after completion.

---

# 17. Phase Dependency Map

```text
PHASE 1 [COMPLETED & VERIFIED ✓]
Authentication (JWT + bcrypt + Single Session Concurrency + Password Reset)
Dashboards (Recruiter & Candidate)
Interview Scheduling & Gated Readiness State
       │
       ▼
PHASE 2 [COMPLETED & VERIFIED ✓]
Resume/JD PDF Upload (Multer with validation)
       ↓
Gemini Direct Extraction (+ pdf-parse dynamic fallback)
       ↓
Simplified Experience Engine (inclusive months, company, years)
       ↓
MongoDB Persistence (Resume, JobDescription, Interview denormalization)
       ↓
Resume–JD Mapping & Project Priorities (HIGH / MED / LOW)
       ↓
3-Group Interview Plan (Architecture, Implementation, Edge Cases)
       ↓
Recruiter Review Workspace (5-Tab Interactive Inspection & Overrides)
       │
       ▼
PHASE 3 [IN PROGRESS — STEPS S0–S4 VERIFIED ✓]
S0 Preflight & S1 Redis State Engine (interview:state:<id>) [✓]
       ↓
S2 Routes & Models + S3 Deterministic Progression Engine [✓]
       ↓
S4 LLM Services & Provider Chain (Groq gpt-oss + Gemini Fallback + Guards) [✓]
       ↓
S5 Text-Mode Dry Run
       ↓
S6 Finalization & Report
       ↓
S7 Deepgram Streaming STT + S8 Deepgram Streaming TTS
       ↓
S9 LiveKit Audio Bot Loop
       ↓
S10 Candidate & Recruiter Live UI
       ↓
S11 E2E Hardening + S12 Docs Sync
```

---

# 18. Definition of Done by Phase

## Phase 1 Done When [STATUS: VERIFIED & COMPLETED ✓]

- [x] Both dashboards exist (Recruiter and Candidate).
- [x] Authentication works (Register, Login, Role Guard, JWT, bcrypt).
- [x] Recruiter/candidate routes are separated with proper route protection.
- [x] Single-session concurrency prevention prevents duplicate logins (`409 Conflict`).
- [x] Password reset flow works via secure token and console link.
- [x] Interview records can be created with scheduled date/time.
- [x] Gated ready/reminder/status interaction works (Candidate cannot join until Recruiter marks ready).
- [x] Automated test suite `node backend/test_phase1.js` passes 100%.

## Phase 2 Done When [STATUS: VERIFIED & COMPLETED ✓]

- [x] Resume PDF can be uploaded (Multer, MIME validation, temporary disk storage).
- [x] JD PDF can be uploaded (Multer, MIME validation, temporary disk storage).
- [x] Gemini directly reads the PDFs (`gemini-2.5-flash` / `gemini-3.8-flash`) with dynamic `pdf-parse` fallback on quota limits.
- [x] Structured JSON is generated and validated against Zod schemas.
- [x] Simplified experience section extracts clean company and years, sanitizes headings/bullets, and computes inclusive months.
- [x] Candidate experience level (`fresher`, `junior`, `mid`, `senior`) and JD experience gap are derived accurately.
- [x] Data is stored persistently in MongoDB (`Resume`, `JobDescription`, `Interview`).
- [x] Resume–JD mapping identifies matched, partial, and missing competencies.
- [x] Projects are prioritized (`HIGH`, `MEDIUM`, `LOW`) based on technical alignment.
- [x] 3-group project-first interview plan is generated with calibrated hidden attributes (`baseDifficulty`, `focusAreas`).
- [x] Recruiter review workspace (5 tabs) allows inspection and overrides with automatic plan regeneration.
- [x] Automated test suites `node backend/test_phase2.js` and `node backend/test_experience_prd.js` pass 100%.

## Phase 3 Done When [STATUS: COMPLETED & VERIFIED ✓ — 100% PASS]

- [x] External API preflight with fail-fast env validation (`backend/scripts/preflight.js`).
- [x] Redis state schema extensions (`question_bank`, `progress`, `consent`, `analysis_queue`) with single-flight mutex lock & Mongo recovery.
- [x] Live routes (`/token`, `/consent`, `/start`, `/end`, `/live-state`, `/report`) with LiveKit observer token protection and role guards.
- [x] Deterministic interview progression engine (`backend/src/services/interviewEngine.service.js`) with 3-group hierarchy, high→med→low project sequence, probe cap of 2, skip logic, and level calibration.
- [x] Multi-provider LLM chain with Groq gpt-oss primary (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`) and Gemini (`gemini-3.5-flash-lite`) fallback (`backend/src/services/ai/llmClient.js`).
- [x] Batched question pre-generation at `/start` (first batch awaited, remaining in background spaced ≥10s) with template fallback.
- [x] 60s cooldowns on 429, rolling 60s TPM guard (~7K threshold), and 200K TPD daily counter guard.
- [x] Prompt injection delimiter protection and normalized Jaccard duplicate avoidance (>0.8).
- [x] Extraction files completely frozen and untouched (`git diff` clean).
- [x] Candidate can join a realtime interview room via LiveKit token.
- [x] Voice is transmitted bidirectionally through LiveKit WebRTC (`@livekit/rtc-node` in-process bot).
- [x] Deepgram produces streaming transcripts from live microphone audio with 1200ms UtteranceEnd and 8s KeepAlive.
- [x] Final candidate answers update Redis working-state (`interview:state:<id>`).
- [x] Evidence and skill status are updated dynamically using strict 6-status evidence taxonomy.
- [x] Evidence gaps influence the next question.
- [x] Next question follows the 3-group hierarchy and project priority order (`HIGH` → `MEDIUM` → `LOW`).
- [x] TTS speaks the next question via Deepgram 24kHz linear16 audio streaming with barge-in cancellation.
- [x] Final state is persisted to MongoDB at interview end (`AssessmentReport` and `InterviewTurn` rows; Redis key wiped).
- [x] Final assessment report is generated and visible to recruiters, while strictly hidden from candidates.
- [x] Automated test suites `node backend/test_phase3.js`, `node backend/test_step_s9.js`, and `node backend/test_step_s10.js` pass 100%.

---

# 19. Final Development Principle

Build the system in the order:

> **Platform → Understanding → Adaptive Interview**

That means:

```text
Phase 1 = Product foundation
Phase 2 = Resume/JD intelligence
Phase 3 = Real-time adaptive interviewing
```

Do not begin with the voice agent. First make the user, interview, dashboard, resume, and JD data models stable. Then add the adaptive voice loop on top of that foundation.
