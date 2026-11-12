# VoiceHire AI — Backend Engine & Orchestration Services ⚙️🤖

The VoiceHire AI backend is a high-concurrency Node.js / Express application coordinating LLM reasoning, document extraction, real-time voice WebRTC streams, active Redis state management, and durable MongoDB storage.

---

## 🏛️ Core Service Architecture

### 1. Document Extraction & Planning (`src/services/`)
- `gemini.service.js`: Multimodal PDF extraction via Google Gemini API with fallback to `pdfParser.service.js` (`pdf-parse`).
- `experienceEngine.service.js`: Extraction sanitization, company normalization, and inclusive end-month duration computation.
- `mapping.service.js`: Automated competency mapping and project prioritization (`HIGH`, `MEDIUM`, `LOW`).
- `planGenerator.service.js`: Dynamic 3-group project-first interview plans.

### 2. State & Engine (`src/services/`)
- `redisState.service.js`: Ephemeral working state management (`interview:state:<id>`) backed by Zod schemas (`redis.schema.js`) with single-flight mutex locking (`interview:lock:<id>`).
- `interviewEngine.service.js`: Deterministic progression engine enforcing project priority sequence, 3-group hierarchy, probe limits (≤2 per group), skip logic, and 6-status evidence taxonomy.

### 3. LLM Provider Chain (`src/services/ai/`)
- `llmClient.js` & `llmChains.js`: Multi-provider fallback chain:
  - **Primary**: Groq API (`openai/gpt-oss-120b` for deep answer analysis & summary, `openai/gpt-oss-20b` for fast probing).
  - **Fallback**: Google Gemini API (`gemini-3.5-flash-lite`).
  - **Quota Discipline**: Rolling 60s TPM guard (~7K threshold), daily TPD guard (<10% remaining), 60s automatic cooldowns on 429 errors.
- `questionGenerator.service.js`: Batched question pre-generation at `/start` with Jaccard duplicate avoidance (>0.8) and deterministic fallback templates.
- `answerAnalysis.service.js`: Answer transcript analysis extracting demonstrated technical skills, project claims, technical depth (0-3), and evidence gaps.
- `reportSummary.service.js`: Executive assessment report synthesis upon session completion.

### 4. Real-Time Voice Pipeline (`src/services/voice/`)
- `voiceSession.js`: In-process LiveKit bot participant (`@livekit/rtc-node`) coordinating STT, TTS, turn manager, barge-in cancellation, and D6 latency telemetry.
- `sttDeepgram.js`: Deepgram streaming Nova-2 STT WebSocket connection (16kHz mono linear16, 8s KeepAlive).
- `ttsDeepgram.js`: Deepgram Aura-Asteria 24kHz linear16 streaming TTS with cancel queue for barge-in.
- `turnManager.js`: Candidate turn-taking detection with 1200ms UtteranceEnd and >400ms barge-in interruption.

### 5. Finalization & Persistence
- `finalizeInterview.service.js`: Idempotent finalization handler writing complete `AssessmentReport` and `InterviewTurn` rows to MongoDB and wiping Redis state (1h TTL).

---

## 🧪 Test Suites Reference

All tests can be executed directly from the `backend/` directory:

```bash
# Preflight Connectivity (Validates all 6 external APIs)
node scripts/preflight.js

# Phase 1 Smoke Test (Auth, Dashboards, Concurrency)
node test_phase1.js

# Phase 2 Smoke Test (PDF Upload, Extraction, Mapping, Planning)
node test_phase2.js

# Experience Engine Bug Fixes Verification
node test_experience_prd.js

# Step S9 Gate Tests (LiveKit Bot, Voice Loop, Barge-in, D6 Latency)
node test_step_s9.js

# Step S10 Gate Tests (Candidate Privacy, Token Grants, Observer Panel)
node test_step_s10.js

# Phase 3 Master Acceptance Suite (All 7 Criteria & Hardening)
node test_phase3.js

# 15-Turn Text-Mode Dry Run Simulation
node scripts/textInterview.js
```

