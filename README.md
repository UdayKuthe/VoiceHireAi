# VoiceHire AI 🎙️🤖

> **Next-Generation Real-Time, Voice-Based Adaptive Technical Interview Platform**

VoiceHire AI is an intelligent interview platform that conducts dynamic, personalized voice interviews. Rather than relying on a static questionnaire, it treats the interview as an **evolving evidence-acquisition process**. It analyzes candidate resumes and job descriptions directly via multimodal LLMs, maintains live candidate evidence states, detects evidence gaps, and adaptively decides follow-up questions in real time.

---

## 🌟 Key Highlights

- **Multimodal LLM Document Processing**: Direct PDF-to-structured-data analysis for resumes and JDs without brittle legacy NLP regexes or skill extraction pipelines.
- **Adaptive Evidence Engine**: Live interview state tracks demonstrated skills, project claims, verification status, and detected evidence gaps.
- **Real-Time Voice Streaming**: Ultra-low-latency voice conversation powered by LiveKit and Deepgram streaming STT/TTS.
- **Groq Reasoning Intelligence**: Powered by Groq's `openai/gpt-oss-120b` reasoning model for in-depth answer analysis and `openai/gpt-oss-20b` for low-latency probes, with automatic Google Gemini 3.5 fallback.
- **Dual-Dashboard Architecture**: Distinct, purpose-built interfaces for **Recruiters** (candidate management, JD/resume review, scheduling, live observer telemetry, evaluation reports) and **Candidates** (distraction-free voice interview experience with live captions and timer).
- **Dual-Layer State Management**: High-speed ephemeral state tracking in Redis during live sessions; durable historical records and final assessment reports persisted in MongoDB.

---

## 🔄 Core Product Loop

```text
Resume PDF + Job Description PDF
           ↓
   Google Gemini API (Multimodal Direct PDF Extraction + pdf-parse fallback)
           ↓
   Structured Resume & JD Data (Experience Engine & Sanitization)
           ↓
   Resume–JD Skill & Requirement Mapping + Project Priorities (HIGH / MED / LOW)
           ↓
   Personalized 3-Group Interview Plan (Architecture → Implementation → Edge Cases)
           ↓
   Real-Time Voice Interview (LiveKit WebRTC + @livekit/rtc-node bot)
           ↓
   Candidate Speech → Streaming STT (Deepgram Nova-2 16kHz)
           ↓
   Groq gpt-oss-120b Answer & Evidence Analysis (Gemini 3.5 Fallback)
           ↓
   Update Live Interview State (Redis under distributed lock)
           ↓
   Detect Unresolved Evidence Gaps & Probe Priorities
           ↓
   Adaptive Question Generation (Batched Pregen + Dynamic Probing)
           ↓
   Streaming TTS (Deepgram Aura-Asteria 24kHz linear16) → Candidate Audio Track
           ↓
   Candidate Hears Next Question (Barge-in supported >400ms speech) ↺
           ↓
   (Post-Interview) Persist to MongoDB AssessmentReport & InterviewTurns (Redis wiped)
```

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React.js (v19) + Vite | Modern, high-performance SPA (`@tailwindcss/vite`, `lucide-react`, `livekit-client`) |
| **Styling & UI** | Tailwind CSS v4 + custom components | Clean, dark-mode accessible design system |
| **Backend** | Node.js + Express.js | REST APIs, Zod validation, mutex locking & session orchestration |
| **Real-Time Audio** | LiveKit | Low-latency WebRTC audio transport (`@livekit/rtc-node`, `livekit-server-sdk`) |
| **Speech-to-Text** | Deepgram STT (Nova-2) | Real-time WebSocket streaming transcription (16kHz linear16, 1200ms UtteranceEnd) |
| **Text-to-Speech** | Deepgram TTS (Aura-Asteria) | 24kHz linear16 natural audio synthesis with sentence streaming & barge-in cancel |
| **Live Interview LLM (Primary)** | Groq API (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`) | Reasoning models for deep answer analysis and low-latency probing |
| **Live Interview LLM (Fallback)** | Google Gemini API (`gemini-3.5-flash-lite`) | Resilient secondary fallback in provider chain |
| **Document Extraction LLM** | Google Gemini API (`gemini-3.8-flash`) | Multimodal direct PDF extraction with local `pdf-parse` fallback (Frozen) |
| **Active Session State** | Redis (`ioredis`) | Ephemeral working state (`interview:state:<id>`) with single-flight locking |
| **Persistent Storage** | MongoDB (`mongoose`) | Durable store for users, profiles, plans, turns, and assessment reports |
| **Authentication & Security** | JWT + bcrypt | Single-session concurrency prevention, password reset token flow, role guards |

---

## 🚀 Development Phases Overview

Implementation spans three comprehensive phases:

### **Phase 1: Foundation, Dashboards & Authentication** [COMPLETED & VERIFIED ✓]
- [x] User authentication with JWT and role-based routing (`RECRUITER` vs. `CANDIDATE`).
- [x] Single-session concurrency prevention (`409 Conflict` on concurrent logins).
- [x] Console token password reset flow (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`).
- [x] Recruiter Dashboard: Candidate list, interview scheduling, readiness status toggle.
- [x] Candidate Dashboard: Profile overview, upcoming interviews, interviewer ready status, gated join button.
- [x] Interview status lifecycle (`draft` → `scheduled` → `reminder` → `recruiter_ready` → `live` → `completed`).
- [x] Verified via `node backend/test_phase1.js` (100% pass).

### **Phase 2: Resume/JD Extraction & Interview Planning** [COMPLETED & VERIFIED ✓]
- [x] PDF upload handling (Multer) for resumes and job descriptions with MIME validation.
- [x] Gemini API direct multimodal parsing with dynamic `pdf-parse` fallback on quota limits.
- [x] Simplified experience engine: sanitization, inclusive month duration calculation, automated experience level derivation (`fresher`, `junior`, `mid`, `senior`), and JD experience gap.
- [x] Extraction of candidates, projects, skills, claims, and JD requirements into validated structured JSON.
- [x] Automated Resume–JD mapping and competency analysis (matched, partial, missing skills).
- [x] Project prioritization (`HIGH`, `MEDIUM`, `LOW`) based on technical alignment.
- [x] Project-first 3-group interview plan generation (`Architecture & Design`, `Implementation & Trade-offs`, `Edge Cases & Operational Lessons`) with calibrated hidden attributes (`baseDifficulty`, `focusAreas`).
- [x] Recruiter review workspace (5-tab interactive inspection, manual edits/overrides, and automatic plan regeneration).
- [x] Verified via `node backend/test_phase2.js` and `node backend/test_experience_prd.js` (100% pass).

### **Phase 3: Real-Time Voice Interview & State Management** [COMPLETED & VERIFIED ✓]
- [x] External API preflight with fail-fast env validation (`backend/scripts/preflight.js`).
- [x] Zod-validated active Redis state engine with mutex locks and Mongo recovery (`redis.schema.js`, `redisState.service.js`).
- [x] Live routes (`/token`, `/consent`, `/start`, `/end`, `/live-state`, `/report`) with LiveKit observer token protection and role guards.
- [x] Deterministic interview progression engine enforcing project priority sequence, 3-group hierarchy, probe cap of 2, skip logic, and status rules (`interviewEngine.service.js`).
- [x] Multi-provider LLM chain with Groq gpt-oss primary (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`), Gemini 3.5 fallback, TPM (~7K)/TPD token guards, and Jaccard duplicate avoidance (`llmClient.js`, `questionGenerator.service.js`, `answerAnalysis.service.js`).
- [x] Batched question pre-generation at `/start` (first batch awaited, remaining in background spaced ≥10s).
- [x] Deepgram 16kHz live streaming STT with noise filtering and 1200ms UtteranceEnd detection (`sttDeepgram.js`, `turnManager.js`).
- [x] Deepgram 24kHz linear16 streaming TTS with cancel queue for barge-in (`ttsDeepgram.js`).
- [x] In-process AI interviewer bot participant via `@livekit/rtc-node` with barge-in cancellation and D6 latency telemetry (`voiceSession.js`).
- [x] Candidate UI (`LiveInterviewPage.jsx`): Consent gate → Mic permission check → User gesture audio unlock → Live captions & elapsed timer (strictly 0 scores or rationale).
- [x] Recruiter Live Observer Panel (`RecruiterObserverPanel.jsx`): Real-time live-state polling every 3s with session termination control.
- [x] Finalization service (`finalizeInterview.service.js`) with idempotency guard, full MongoDB AssessmentReport & InterviewTurn persistence, and Redis state destruction.
- [x] Master E2E acceptance suite (`backend/test_phase3.js`) verifying all 7 criteria and forced failure paths (100% pass).

---

## ⚙️ Prerequisites & Local Setup

### 1. System Requirements
- **Node.js**: v18+ LTS (v22 tested)
- **MongoDB**: Local MongoDB Community Server running on `mongodb://127.0.0.1:27017`
- **Redis**: Local Redis instance or Memurai running on `redis://127.0.0.1:6379`
- **Browser**: Modern Chrome or Edge with microphone permissions

### 2. External API Accounts
- [GroqCloud Console](https://console.groq.com/) (Groq API Key for `openai/gpt-oss-120b` and `openai/gpt-oss-20b`)
- [Google AI Studio](https://aistudio.google.com/) (Gemini API Key)
- [Deepgram Console](https://console.deepgram.com/) (Deepgram API Key)
- [LiveKit Cloud](https://cloud.livekit.io/) (URL, API Key, API Secret)

---

## 🔑 Environment Variables Configuration

Copy `backend/.env.example` to `backend/.env` and supply valid keys:

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017/voicehire
REDIS_URL=redis://127.0.0.1:6379

JWT_SECRET=your_secure_jwt_secret

# Groq API
GROQ_API_KEY=your_groq_api_key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL_ANALYSIS=openai/gpt-oss-120b
GROQ_MODEL_FAST=openai/gpt-oss-20b
GROQ_REASONING_EFFORT=low

# Google Gemini API
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite

# Deepgram STT & TTS
DEEPGRAM_API_KEY=your_deepgram_api_key
DEEPGRAM_STT_MODEL=nova-2
DEEPGRAM_TTS_MODEL=aura-asteria-en

# LiveKit WebRTC Infrastructure
LIVEKIT_URL=wss://your-livekit-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# LLM Resilience Controls
LLM_TIMEOUT_MS=8000
LLM_COOLDOWN_SECONDS=60
MOCK_VOICE=false
```

#### Frontend (`frontend/.env`):
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_LIVEKIT_URL=wss://your-livekit-project.livekit.cloud
```

---

## 🧪 Automated Testing & Verification

All automated test suites can be run directly from the `backend/` directory:

```bash
# 1. API Preflight Connectivity Check (Validates all 6 external services)
node backend/scripts/preflight.js

# 2. Phase 1 Smoke Test (Auth, Dashboards, Concurrency, Password Reset)
node backend/test_phase1.js

# 3. Phase 2 Extraction & Planning Test (Upload, Parsing, Mapping, 3-Group Plan)
node backend/test_phase2.js

# 4. Experience Engine Bug Fixes Verification (Sanitization, Inclusive Months)
node backend/test_experience_prd.js

# 5. Step S9 Gate Tests (LiveKit Bot, WAV Voice Loop, Barge-in, D6 Latency)
node backend/test_step_s9.js

# 6. Step S10 Gate Tests (Candidate UX, Privacy Boundary, Recruiter Observer Panel)
node backend/test_step_s10.js

# 7. Phase 3 Master E2E Acceptance Suite (All 7 Criteria & Failure Hardening)
node backend/test_phase3.js

# 8. Frontend Production Bundle Compilation
cd frontend && npm run build
```

---

## 🏃 Starting the Application Locally

```bash
# Terminal 1: Start Backend API & Voice Orchestrator
cd backend
npm install
npm run dev

# Terminal 2: Start Frontend Application
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 📖 In-Depth Documentation

For thorough architectural and planning specifications, refer to:
- [VoiceHire AI Final PRD](./VoiceHire_AI_Final_PRD.md)
- [VoiceHire AI Task PRD (Phase 3 Build Spec)](./task_prd.md)
- [VoiceHire AI Setup & Phase Plan](./VoiceHire_AI_Setup_and_Phase_Plan.md)

---

## 📄 License

This project is licensed under the MIT License.
