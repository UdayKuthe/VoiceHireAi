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

- Google AI Studio / Gemini API
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

# 8. Gemini API — LLM and Direct PDF Understanding

The project uses **Google Gemini API** as the LLM layer.

Why:

- It supports document/PDF input.
- The application can submit the PDF directly to the model.
- A separate NLP skill-extraction pipeline is therefore not required.

Google documents local PDF files as a supported Gemini API input method. citeturn764600search0

### Get the API key

Use:

https://ai.google.dev/aistudio

Google AI Studio provides a path to create/manage Gemini API keys. citeturn346258search1turn346258search14

### Store the key

Store it only in the **backend** `.env` file:

```text
backend/.env
```

Example:

```env
GOOGLE_GEMINI_API_KEY=your_key_here
```

Never put the Gemini secret key in:

```text
frontend/.env
```

and never commit it to Git.

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

After creating the Node.js backend, install the packages required by the current architecture.

Example:

```powershell
npm install express cors dotenv mongoose jsonwebtoken bcryptjs zod multer
npm install ioredis
npm install @google/genai
npm install @deepgram/sdk
npm install livekit-server-sdk
```

For development:

```powershell
npm install -D nodemon
```

Package versions should be pinned in `package-lock.json` after installation.

---

# 12. Frontend Packages

Create the frontend with Vite:

```powershell
npm create vite@latest frontend -- --template react
cd frontend
npm install
```

Install UI dependencies:

```powershell
npm install react-router-dom axios
npm install tailwindcss
```

If shadcn/ui is used, initialize it according to the current shadcn documentation after Tailwind/Vite setup.

For the interview UI, add the selected LiveKit client package required by the current LiveKit JavaScript/React integration.

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

# Phase 1 — Dashboards, Authentication & Basic Interaction

## Phase 1 Goal

Build the application foundation before adding AI extraction or realtime interviewing.

## 1. Authentication

Implement:

- Register
- Login
- Logout
- Password reset
- Role selection/assignment
- Protected routes

Roles:

```text
RECRUITER
CANDIDATE
```

---

## 2. Recruiter Dashboard

Implement:

- Dashboard layout
- Candidate list
- Create Interview button
- Upcoming interviews
- Interview status cards
- Recruiter readiness toggle

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

Implement:

- Profile
- Upcoming interview
- Date/time
- Interview status
- Recruiter readiness indicator
- Join interview button

Example:

```text
AI Engineer Interview
10:30 AM

Recruiter: Ready ✓

[ Join Interview ]
```

---

## 4. Basic Interview State

Create initial MongoDB interview record:

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

Implement states:

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

## Phase 1 Deliverable

By the end of Phase 1:

```text
Recruiter Login
   ↓
Recruiter Dashboard
   ↓
Create Interview
   ↓
Schedule Interview
   ↓
Recruiter Ready
   ↓
Candidate Dashboard
   ↓
Candidate Sees Reminder / Ready State
   ↓
Join Interview
```

No AI extraction and no live AI questioning yet.

---

# Phase 2 — Resume/JD Extraction & Interview Planning

## Phase 2 Goal

Turn uploaded resume/JD PDFs into structured information and create the interview plan.

---

## 1. Resume Upload

Implement:

```text
Recruiter Dashboard
      ↓
Candidate
      ↓
Upload Resume PDF
      ↓
Backend receives file
      ↓
Temporary local storage
```

Use `multer` or an equivalent file-upload middleware.

---

## 2. JD Upload

Same flow:

```text
Upload JD PDF
      ↓
Temporary local storage
      ↓
Gemini
```

---

## 3. Direct LLM PDF Extraction

Do **not** build:

```text
PDF
 ↓
OCR/NLP
 ↓
Keyword skill extraction
```

Instead:

```text
PDF
 ↓
Gemini API
 ↓
Structured JSON
```

### Resume extraction prompt should request

- Candidate information
- Education
- Skills
- Projects
- Technologies
- Experience
- Responsibilities
- Certifications
- Resume claims

### JD extraction prompt should request

- Job title
- Required skills
- Preferred skills
- Responsibilities
- Qualifications
- Technologies
- Experience requirements

---

## 4. Save Extraction Result

After extraction:

```text
PDF
 ↓
Gemini
 ↓
Validated JSON
 ↓
MongoDB
```

Store the structured JSON in the appropriate candidate/resume/JD collections.

---

## 5. Resume–JD Mapping

Implement service:

```text
resumeData + jdData
        ↓
      LLM
        ↓
Matched Skills
Partial Skills
Missing Skills
Verification Priorities
```

Store the mapping in MongoDB.

---

## 6. Interview Planning

Generate:

```text
Project priorities
JD-relevant skills
Resume claims to verify
Remaining JD requirements
Other relevant resume skills
```

Save the interview plan to MongoDB.

---

## 7. Recruiter Review Screen

Before the voice interview begins, the recruiter should be able to review:

- Extracted resume data
- Extracted JD requirements
- Resume–JD mapping
- Interview plan

The recruiter should be able to make minor corrections if an extracted value is obviously incorrect.

---

## Phase 2 Deliverable

```text
Resume PDF + JD PDF
        ↓
Gemini Direct PDF Analysis
        ↓
Structured Data
        ↓
MongoDB
        ↓
Resume–JD Mapping
        ↓
Interview Plan
```

---

# Phase 3 — Real-Time Voice Interview & State Management

## Phase 3 Goal

Build the main research/product contribution: the live adaptive evidence-driven interview.

---

## 1. Create Live Interview State

At interview start:

```text
MongoDB interview data
        ↓
Initialize Redis state
```

Redis state should contain:

```json
{
  "candidate_context": {},
  "job_context": {},
  "assessment_plan": {},
  "interview_state": {
    "current_phase": "project",
    "current_question": null,
    "question_history": [],
    "answer_history": [],
    "evidence": [],
    "resume_claims": [],
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
Candidate Browser
      ↕
LiveKit Room
      ↕
Interview Backend / Voice Service
```

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

## 7. Next Question Generation

Input to LLM:

```text
Current interview state
+ current candidate answer
+ relevant resume/JD context
+ evidence gaps
+ previous questions
```

Output:

```text
Candidate next question
```

The question should be targeted toward obtaining the next useful piece of evidence.

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
PHASE 1
Authentication
Dashboards
Interview Status
Basic Interaction
       │
       ▼
PHASE 2
Resume/JD PDF Upload
       ↓
Gemini Extraction
       ↓
MongoDB
       ↓
Resume–JD Mapping
       ↓
Interview Plan
       │
       ▼
PHASE 3
LiveKit
       ↓
Deepgram STT
       ↓
Answer Analysis
       ↓
Redis Interview State
       ↓
Evidence Gap
       ↓
Adaptive Question
       ↓
Deepgram TTS
       ↓
MongoDB Final Report
```

---

# 18. Definition of Done by Phase

## Phase 1 Done When

- Both dashboards exist.
- Authentication works.
- Recruiter/candidate routes are separated.
- Interview records can be created.
- Interview date/time is visible.
- Ready/reminder/status interaction works.

## Phase 2 Done When

- Resume PDF can be uploaded.
- JD PDF can be uploaded.
- Gemini directly reads the PDFs.
- Structured JSON is generated.
- Data is stored in MongoDB.
- Resume–JD mapping works.
- Interview plan is generated and visible.

## Phase 3 Done When

- Candidate can join a realtime interview.
- Voice is transmitted through LiveKit.
- Deepgram produces streaming transcripts.
- Final candidate answers update Redis state.
- Evidence and skill status are updated.
- Evidence gaps influence the next question.
- TTS speaks the next question.
- Final state is persisted to MongoDB.
- Final assessment report is generated.

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
