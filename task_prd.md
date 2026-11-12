# VoiceHire AI — Phase 3 Task PRD (Agent Build Spec)
v1.5 | Refs: FR-11..FR-19 | Source of truth: master PRD.md v1.4 | Phases 1–3 are complete
Status: COMPLETE — All steps S0–S12 COMPLETED & VERIFIED ✓
Goal: the live adaptive evidence-driven interview (main product contribution).

## 0. Agent Rules
- Edit existing code with minimal diffs; do not read unrelated files.
- FROZEN, read outputs only, never edit: auth, dashboards, upload/extraction pipeline, experience engine, mapping, plan generation.
- EXTRACTION IS UNTOUCHED: its code, prompts, env variable(s), model (currently `gemini-3.8-flash`) and `pdf-parse` fallback must not change. Interview code must never import or call the extraction model config. No Gemini 3.5 fallback is added to extraction. Allowed exception: none.
- Work ONE STEP at a time (§1). After each step, STOP and ask whether to continue. Never start the next step without `PROCEED S<n>`.
- Every Redis write is Zod-validated. Every LLM output is Zod-validated.
- Secrets are server-side only (§14). Never print, log or commit key values.
- Never silently swap an API, model, or provider beyond the approved chains in §4. Never fake a passing gate with mocks (§2.4).
- Abbrevs: IV=interview, CAND=candidate, REC=recruiter, TR=transcript, EG=evidence gap, STT/TTS=speech to/from text, RPM/RPD=requests per minute/day, TPM/TPD=tokens per minute/day

## 1. Execution Protocol
Phase 3 = 4 stages, 13 steps (S0–S12), listed in §15. Each step is one small agent session.

Current state: S0–S4 are PASS (verified with 100% test coverage). Resume at S5 on the user's `PROCEED S5`.
Fresh start: the agent begins at S0 only after `START PHASE 3`.

Per-step loop:
1. Read only the files listed in the step.
2. Run the step's API preflight (§2.2) if it uses an external API.
3. Build only the step's scope.
4. Run the step's tests plus regression (`test_phase1.js`, `test_phase2.js`, `test_experience_prd.js`).
5. Output the STEP REPORT, then the CONTINUE PROMPT, then STOP and wait.

STEP REPORT:
```
Step: S<n> <name>
Status: PASS | BLOCKED | PARTIAL
Files changed: <list>
Tests: <name: pass/fail>
API checks: <api: ok/fail>
LLM calls this step: <provider/model: count; tokens used if known> (live calls only at gates)
Docs touched/needed: <md files changed, or md files that will need updates in S12>
Deviations/assumptions: <list or none>
Open issues: <list or none>
Suggested commit: <message>
```

CONTINUE PROMPT (mandatory, last line of every step, verbatim format):
```
Step S<n> <PASS|BLOCKED|PARTIAL>. Next: S<n+1> <name>.
Shall I continue? Reply "PROCEED S<n+1>" to continue, "REDO S<n>" to retry, or tell me what to change.
```
- If Status ≠ PASS, the prompt must say what blocks progress and must not offer to proceed until the user resolves it or explicitly accepts the risk.
- After S12, the prompt is replaced by: "Phase 3 complete. All acceptance checks (§17) listed with results. Awaiting your review."

Rules:
- Gate = all step tests green plus regression green. A failing gate = BLOCKED.
- Max 2 fix attempts per failure, then report BLOCKED with diagnosis. No endless retry loops.
- Scope creep is forbidden: needs outside the step go into "Open issues".
- Each step = one logical commit.
- Quota discipline: tests use fixtures. Live LLM calls happen only at a step's gate. Never run live extraction in tests (it would burn the extraction model's tiny daily quota). Groq free tier is only 8K TPM and 200K TPD per model, so keep gate prompts small and space live Groq calls at least 15 s apart.

## 2. API Failure Protocol (ALL steps)
APIs: Groq (LLM, interview agents), Gemini (extraction + fallback), Deepgram STT, Deepgram TTS, LiveKit, Redis, MongoDB.

### 2.1 On any API failure the agent MUST
1. STOP feature work. Do not code around the failure.
2. DIAGNOSE (read-only, max 5 min):
   - Key/env: present, non-empty, no whitespace/quotes, loaded from the right `.env`.
   - URL: LIVEKIT_URL scheme (`wss://`), GROQ_BASE_URL, REDIS_URL, MONGODB_URI reachable.
   - Auth: 401/403 → invalid or unauthorized key.
   - Quota/rate: 429 / quota text → free-tier limit. Read `retry-after` and whether it is per-minute (RPM/TPM) or per-day (RPD/TPD). For Groq, say which of the four limits was hit.
   - Model/voice name: 404 / "model not found" → verify via the provider's list-models endpoint (Groq `GET /models`, Gemini list-models) or docs. Groq gpt-oss ids carry the `openai/` prefix.
   - Empty or truncated output from Groq gpt-oss: check `finish_reason`. `length` means reasoning tokens consumed the output cap (raise the cap, see §4).
   - Network: sandbox allowlist may block the domain (check the `x-deny-reason` header).
   - Payload: sample rate, encoding, JSON schema, size limits.
   - Provider status: outage vs local problem.
3. REPORT with the API INCIDENT format and ask the user to choose. STOP and wait.
4. Do not switch provider, model, or key outside §4, and do not edit the tech stack, until the user decides.

Runtime vs dev-time: the automatic chain failover in §4 and §12 is product behavior and needs no user approval. The incident protocol applies when a step cannot pass its gate, or when all providers in a chain fail at dev time.

API INCIDENT:
```
API: <name> | Step: S<n>
Symptom: <HTTP code / error text / timeout>
Checked: <what was verified, with results>
Likely cause: <1 line>
Options:
 A) Fix on your side: <exact action: regenerate key, enable billing, correct URL>
 B) Switch model/plan within same provider: <suggestion>
 C) Switch provider: <suggestion from 2.3> (needs master PRD §9 change)
 D) Temporary mock for dev only: <what is mocked, what is NOT proven>
Recommendation: <one option and why>
Awaiting your choice.
```

### 2.2 Preflight (`backend/scripts/preflight.js`; extended in S4 for Groq)
One minimal real call per API, printing PASS/FAIL with the reason:
- Groq: `GET /models` to confirm GROQ_MODEL_ANALYSIS (`openai/gpt-oss-120b`) and GROQ_MODEL_FAST (`openai/gpt-oss-20b`) exist, then one tiny JSON-mode call per model using the gpt-oss settings in §4. Detect whether `json_schema` structured output works (print yes/no). Print the limits from the response headers (`x-ratelimit-*`: requests = daily, tokens = per-minute) and tell the user to compare with console.groq.com/settings/limits.
- Gemini (fallback): one tiny JSON-mode call with GEMINI_FALLBACK_MODEL (`gemini-3.5-flash-lite`).
- Gemini (extraction model): list-models validation ONLY (name exists). NO generate call, so its small free quota is not spent.
- Deepgram STT: open WS with the configured model, send 1 s of silence, close cleanly.
- Deepgram TTS: synthesize "test" at 24 kHz linear16, expect >0 bytes; validate the voice/model name.
- LiveKit: create an AccessToken, call RoomService `listRooms`.
- Redis: PING + SET/GET/DEL with TTL.
- MongoDB: connect + ping.
Flag `--only groq,gemini,deepgram-stt,...`. Exit 1 on any failure. Each step runs `preflight --only <its APIs>` first. Space the two Groq calls at least 15 s apart.

### 2.3 Alternatives (suggest only; user decides)
| API | Failure | Same provider (A/B) | Switch (C) |
|---|---|---|---|
| Groq | 401 | New key from console.groq.com | — |
| Groq | 429 (TPM) | Smaller prompts, spacing; the runtime chain already falls back | — |
| Groq | 429 (RPD/TPD) | Wait for the UTC daily reset; the chain falls back to the next model, then Gemini 3.5; the Developer plan raises limits | Another OpenAI-compatible provider via `llmClient` |
| Groq | model 404 | Pick a valid id from `GET /models` (keep the `openai/` prefix) | — |
| Gemini fallback | 429/quota | Wait for the daily reset; enable billing for higher limits | Another provider via `llmClient` |
| Gemini extraction | any | NOT part of Phase 3. Report to the user only. Do not modify extraction. | — |
| Deepgram STT | 401/402/quota | New key, check credit ($200 free credit) | AssemblyAI streaming / Google STT |
| Deepgram STT | model/language | Another model (nova family) | Local Whisper (higher latency, breaks D6) |
| Deepgram TTS | 401/quota/voice | Another Aura voice/model | ElevenLabs / OpenAI TTS / Cartesia |
| LiveKit | auth/URL | Recheck project URL, key, secret | Local `livekit-server --dev` |
| Redis | refused | Start local Redis | Docker Redis / Upstash |
| MongoDB | refused | Start mongod | Atlas free tier |
A provider switch changes master PRD §9: it needs explicit user approval and a "PRD UPDATE needed" flag.

### 2.4 Mock policy
- `MOCK_VOICE=true` mocks STT/TTS/LLM for unit/E2E tests only.
- A step that needs a live API cannot be PASS on mocks. It is PARTIAL until the live check passes or the user explicitly accepts a mock.
- Runtime fallbacks (§12) are product behavior, separate from this dev-time protocol.

## 3. Phase 3 Functional Spec (from the original task; authoritative)

### 3.1 Live Interview State (Redis Engine)
At interview start, initialize the active session state in Redis from MongoDB records using `backend/src/schemas/redis.schema.js`:
```text
MongoDB Interview, Resume, Mapping & Plan
        ↓
RedisStateService initialization
        ↓
Redis Active State Key: interview:state:<interviewId>
```
Verified Redis schema structure (Zod validated):
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
    "skills": [{ "name": "Node.js", "level": "", "evidence": "" }],
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
        "order": 1, "type": "intro", "name": "Introduction & Background", "durationMinutes": 5,
        "groups": [
          { "name": "Context & Career Overview", "baseDifficulty": "medium", "focusAreas": ["career progression"] }
        ]
      },
      {
        "order": 2, "type": "project", "name": "AI Screening Platform", "priority": "high", "durationMinutes": 15,
        "groups": [
          { "name": "Architecture & Design", "baseDifficulty": "medium", "focusAreas": ["modular design", "system flow"] },
          { "name": "Implementation & Technical Trade-offs", "baseDifficulty": "medium", "focusAreas": ["concurrency trade-offs", "framework selection"] },
          { "name": "Edge Cases & Operational Lessons", "baseDifficulty": "medium", "focusAreas": ["fault tolerance", "error handling"] }
        ]
      },
      {
        "order": 3, "type": "requirements", "name": "Remaining Job Requirements", "durationMinutes": 10,
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

### 3.2 Real-Time Voice Connection (LiveKit)
```text
Candidate Browser (livekit-client)
      ↕ WebRTC Audio
LiveKit Cloud / Server
      ↕ Audio Egress / Participant
Interview Backend / Voice Service (livekit-server-sdk)
```
Token endpoint: `POST /api/interviews/:id/token` (authenticated; candidate role or recruiter observer).
- Service signs a LiveKit JWT with `livekit-server-sdk` `AccessToken`:
  - apiKey: `process.env.LIVEKIT_API_KEY`; apiSecret: `process.env.LIVEKIT_API_SECRET`
  - identity: Candidate ID / User ID
  - metadata: Candidate Name and Interview Context (keep small, see §16)
  - grant: `{ roomJoin: true, room: interviewId, canPublish: true, canSubscribe: true }` (CAND). REC grant per D10.
- Frontend: `frontend/src/pages/candidate/LiveInterviewPage.jsx` installs `livekit-client`, calls the token endpoint after gated join approval, and connects to `VITE_LIVEKIT_URL`.

### 3.3 Speech-to-Text (Deepgram streaming)
```text
Candidate Speech → LiveKit Audio → Deepgram Streaming STT → Interim Transcript → Final Transcript
```
Only the finalized response updates the authoritative evidence state.

### 3.4 Answer Analysis
```text
Final Transcript → LLM → Extract: skills, evidence, claims, responsibilities, uncertainty, missing information
```

### 3.5 Redis State Update
Update after each analysis: `skill_state`, `evidence`, `resume_claims` (stored as `candidate_context.claims`), `claim_verification`, `evidence_gaps`, `question_history`, `answer_history`, `remaining_areas`. The updated state is the context for the next decision.

### 3.6 Evidence Gap Detection (reference example)
```text
Resume Claim: Implemented Redis caching
Answer:       I integrated Redis into the application.
State:        Redis → Partially Verified
Gap:          What was the candidate's exact implementation responsibility?
```

### 3.7 Next Question Generation & Adaptive Progression
LLM input:
```text
Current interview state (Redis: interview:state:<interviewId>)
+ current candidate answer & transcript
+ candidate context (experienceLevel, totalYears, companies, skills, claims)
+ assessment plan (project priority sequence, 3-group hierarchy, focusAreas, baseDifficulty)
+ detected evidence gaps
+ previous question_history & answer_history
```
Selection logic:
1. Section sequence: Introduction → Projects (strictly by `priority`: HIGH → MEDIUM → LOW) → Remaining Job Requirements.
2. 3-group progression per project:
   - Group 1 Architecture & Design: high-level topology, module boundaries, architectural trade-offs.
   - Group 2 Implementation & Technical Trade-offs: deep technical decisions, library choices, coding challenges.
   - Group 3 Edge Cases & Operational Lessons: failure modes, scaling bottlenecks, operational debugging, post-mortems.
3. Experience calibration:
   - fresher (<1 yr): foundational concepts, basic component design, syntax/API usage, guided scenarios.
   - junior (1–<3 yrs): standard design patterns, direct implementation trade-offs, debugging practical bugs.
   - mid (3–<6 yrs): system architecture, scalability decisions, concurrency, edge-case mitigation.
   - senior (6+ yrs): large-scale distributed architecture, complex failure domains, cross-cutting concerns, tech strategy.
4. Gap-directed probing: a partially verified claim or unresolved skill gap → one targeted follow-up in the active group before advancing.
Output: one focused question targeting the next piece of technical evidence.
Implementation note (v1.3): main questions are pre-generated at `/start` (§4, §11-A); only probes call the LLM live.

### 3.8 Text-to-Speech (Deepgram streaming)
```text
Generated Question → Deepgram TTS → Audio Stream → LiveKit → Candidate
```

### 3.9 Repeat Until Completion
```text
Question → Candidate Answer → STT → Evidence Analysis → Redis State Update → Evidence Gap → Next Question → TTS → Question
```
Stop when the configured interview duration/assessment coverage is reached or the recruiter ends the interview.

### 3.10 Final Persistence
```text
Redis Active State → Finalize Interview → MongoDB → Final Assessment Report
```
The completed state is persisted so the interview does not depend on Redis after completion.

## 4. LLM Provider Matrix (approved by user)
Goal: spend the free quotas wisely. Groq gpt-oss is primary for live interview agents. Gemini 3.5 is the fallback for ALL interview/evaluation agents. Extraction keeps its own model and is outside this matrix.

| Agent | Runs | Chain (in order) |
|---|---|---|
| Resume/JD extraction (Phase 2) | On upload / re-extract | FROZEN: existing Gemini config (currently `gemini-3.8-flash`) → existing `pdf-parse` fallback. Not routed through `llmClient`. |
| Mapping + plan (Phase 2) | Upload / edits | FROZEN: unchanged. |
| Question pre-generation | At `/start` (batched, §11-A) | Groq `GROQ_MODEL_ANALYSIS` → Groq `GROQ_MODEL_FAST` → Gemini `GEMINI_FALLBACK_MODEL` → template questions |
| Answer analysis | Every answered turn | Groq `GROQ_MODEL_ANALYSIS` → Groq `GROQ_MODEL_FAST` → Gemini `GEMINI_FALLBACK_MODEL` → template probe + `analysis_queue` |
| Probe question text | Only when the engine picks a probe | Groq `GROQ_MODEL_FAST` → Gemini `GEMINI_FALLBACK_MODEL` → template question |
| Evaluation / report summary | Once at finalize | Groq `GROQ_MODEL_ANALYSIS` → Gemini `GEMINI_FALLBACK_MODEL` → deterministic summary |

Model values: GROQ_MODEL_ANALYSIS=`openai/gpt-oss-120b`, GROQ_MODEL_FAST=`openai/gpt-oss-20b`, GEMINI_FALLBACK_MODEL=`gemini-3.5-flash-lite`. The `openai/` prefix is part of the Groq model id. The old Llama models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) are deprecated and must not appear anywhere. `gemini-3.8-flash` is NOT used by any interview agent.

### 4.1 Free-tier facts (per model, applied per organization, so extra keys add nothing)
- Groq `openai/gpt-oss-120b` and `openai/gpt-oss-20b`: 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD. Each model has its own daily bucket.
- Gemini `gemini-3.5-flash-lite`: about 10 RPM and about 500 RPD.
- Capacity estimate: ~2K tokens per analysis call → about 50K tokens per interview on the 120B bucket, so roughly 3–4 full interviews per day on free tier. Enough for development and demos. The chain falls back to the 20B model and then to Gemini when a bucket is exhausted, so interviews keep running.

### 4.2 Call budget per interview (target)
1 batched pre-generation (a few small calls) + ~1 analysis call per answered turn + probe calls only when needed + 1 report call. Main questions are NOT generated live. A normal turn = 1 LLM call; a probe turn = 2.

### 4.3 gpt-oss handling (reasoning models)
- Use the OpenAI-compatible Groq API: base `GROQ_BASE_URL`, key `GROQ_API_KEY`.
- Send `reasoning_effort: "low"`. Reasoning tokens count as output tokens.
- Output caps: `max_completion_tokens` ≥ 1024 for analysis and pre-generation batches, ≥ 600 for probes. If `finish_reason` is `length` or the content is empty: retry once with double the cap, then go to the next chain entry.
- Read only the final message content. Ignore any reasoning field. Never store or forward reasoning text.
- JSON: use `json_schema` structured output if preflight shows it works for the model, else `response_format: json_object` with the schema in the prompt. The prompt must contain the word "JSON". Always validate with Zod.
- Temperature 0–0.3 for analysis; ≤0.7 for question text.

### 4.4 Chain mechanics (`backend/src/services/ai/llmClient.js`, chains in `backend/src/config/llmChains.js`)
- Gemini fallback via the existing Google SDK with `GEMINI_FALLBACK_MODEL` and `GOOGLE_GEMINI_API_KEY`.
- On 429: move to the next entry immediately. Cool the failed provider+model down for `retry-after` seconds, else `LLM_COOLDOWN_SECONDS`. If the error says daily (RPD/TPD), cool for 1 h, then retest. Cooled entries are skipped.
- On timeout (`LLM_TIMEOUT_MS`), 5xx or invalid JSON: retry 1x on the same entry, then next entry. On 401/403: skip the entry for the rest of the process and log a clear error (no key values).
- Chain exhausted → the deterministic template fallback (§12). The loop never blocks.
- Log per call: task, provider, model, latency ms, status, fallbackDepth, finish_reason, tokens if known. Never log prompts containing PII or keys.
- Expose `getLlmStats()` (calls and tokens per provider/model per task) for tests and the S5 report.

### 4.5 Token guards (required; Groq free TPM is only 8K)
- Estimate tokens before each call (input + the output cap). Keep any single call under ~3K total (pre-generation batches under ~5K).
- Keep a rolling 60-second token counter per model. If a call would push past ~7K TPM, wait up to 5 s, else go to the next chain entry (do not fail the turn).
- Keep a per-model daily token counter (UTC day, in-process, optionally mirrored in Redis key `llm:usage:<model>:<yyyymmdd>`). TPD is not exposed in headers, so count locally. When under 10% remains, skip that entry.
- Trim prompts: send only the relevant claims/skills and the last 3 Q&A, never the full state.
- Log every guard decision (wait, skip, fallback) with its reason.

## 5. Defaults [D#] for gaps the spec leaves open (override via CHANGE)
- D1 Voice host: in-process backend bot participant `ai-interviewer` using `@livekit/rtc-node` (audio tracks) + `livekit-server-sdk` (tokens/rooms). The server SDK alone cannot handle audio tracks.
- D2 Turn-taking: the turn ends when Deepgram `speech_final` is followed by 1200 ms of no new speech (UtteranceEnd). Barge-in: CAND speech >400 ms during TTS stops TTS and flushes the audio queue.
- D3 Silence: 20 s of no speech after a question → re-prompt once ("Take your time — shall I repeat?"). After 2 re-prompts, mark the answer `no_response` and advance.
- D4 Probe cap: max 2 follow-ups per group; min 1 question per group.
- D5 Time: soft end = sum(section.durationMinutes); hard cap = soft + 10 min. At the soft end, finish the current question, then wrapup.
- D6 Latency: p50 ≤3 s, p95 ≤5 s from final end-of-speech to first TTS audio. Log per-stage timings.
- D7 LLM failure: per-call timeout `LLM_TIMEOUT_MS` (8 s), retry 1x, then the next chain entry (§4), finally the deterministic fallback (§12). The loop never blocks.
- D8 Disconnect: 60 s grace, then IV `paused`; rejoin resumes. After 5 min paused, finalize as `partial`.
- D9 Consent: CAND must accept a recording/transcript consent checkbox before join. Store `consentAt`; block join without it. Retention policy out of scope.
- D10 REC role: observer token (`canPublish:false`, `canSubscribe:true`) plus polling live-state API (3 s). REC can end the IV.

## 6. Schema Extensions (backend/src/schemas/redis.schema.js; extend, don't break)
Enums:
- sectionType: intro | project | requirements
- phase: intro | project | requirements | wrapup
- priority (Redis): high | medium | low. Mongo/UI use UPPERCASE; normalize with `normalizePriority()`.
- evidenceStatus: not_assessed | observed | partially_verified | sufficiently_verified | unverified | contradictory
- interview_status: initializing | active | paused | completing | completed | partial | error

job_context ADD (default `[]`/`""`): responsibilities[], qualifications[], technologies[], experience_requirements (string).

Shapes:
- question: {id, text, section, project|null, group, kind:"main"|"probe"|"clarify"|"reprompt", targetRef:{type:"skill"|"claim"|"requirement"|"topic", key}, askedAt}
- answer: {questionId, transcript, startedAt, endedAt, durationMs, status:"answered"|"no_response", analysisStatus:"done"|"pending"|"failed"}
- evidence: {id, answerId, skill|null, claimRef|null, project|null, snippet(≤200 chars), type:"ownership"|"technical_depth"|"tradeoff"|"metric"|"uncertainty"|"contradiction", strength:0-3}
- skill_state[skillName]: {status:evidenceStatus, evidenceIds[], lastUpdated}
- claim_verification[claimKey]: {claimText, status:evidenceStatus, evidenceIds[], notes}
- evidence_gap: {id, targetRef, description, raisedAtQuestionId, resolved:false, resolvedAtQuestionId|null}
- progress: {sectionIdx, groupIdx, probesUsed, questionsInGroup, startedAt, elapsedMs}
- question_bank: map keyed `"<sectionIdx>-<groupIdx>"` → {text, targetRef, source:"llm"|"template"}; filled at `/start` in batches (§11-A).
- interview_state ADD: `progress`, `consent`, `analysis_queue[]`, `question_bank`.
- `skills[].level` is legacy: keep, ignore. Use passthrough/optional so legacy fields (`skills.level`, `relevantYears`) never fail Zod.

## 7. Redis Engine (backend/src/services/redisState.service.js)
- Key `interview:state:<id>` (JSON string). TTL 6 h, refreshed on every write.
- Lock `interview:lock:<id>` (SET NX PX 30000). Single-flight turn processing per IV. Release in `finally`.
- API: `init(interviewId)`, `get`, `patch(fn)` (read-validate-mutate-validate-write under lock), `appendQuestion`, `appendAnswer`, `finalizeSnapshot`, `destroy(ttl 1h)`.
- `init` loads Mongo Interview + Resume + JD + Mapping + Plan. Throws a typed error if any is missing or the plan has 0 sections. Idempotent: if the key exists and the IV is live, return the existing state.
- Write-through: after each turn, upsert `InterviewTurn` into Mongo.
- Recovery: key missing and Mongo IV `live`/`paused` → rebuild from Mongo + InterviewTurn rows (including `question_bank`, persisted on the Interview doc as batches complete), then resume.
- Convert ObjectIds to strings before serializing.

## 8. API (backend/src/routes/interviewLive.routes.js)
All endpoints require auth plus an ownership check (CAND owns the IV, or REC owns the candidate/IV). Errors: `{error, code, message}` with actionable text (master PRD §15).

| Endpoint | Role | Behavior |
|---|---|---|
| POST /api/interviews/:id/token | CAND, REC | IV status ∈ {recruiter_ready, live, paused}, else 400. CAND needs consent (else 403 `CONSENT_REQUIRED`). Room = interviewId. TTL 2 h. CAND: publish+subscribe. REC: observer grant. identity=userId; metadata=small JSON {name, role}. Returns {token, url}. |
| POST /api/interviews/:id/consent | CAND | Stores consentAt. |
| POST /api/interviews/:id/start | CAND | Idempotent. Redis init → pre-generate main questions (first batch awaited, rest in background, §11-A) → status `live` → spawn voice session singleton → greet → first question. Second call returns the current state and does NOT regenerate questions. |
| GET /api/interviews/:id/live-state | REC | Sanitized: phase, current q, progress, skill_state, claim_verification, open gaps, elapsed, error flag. Never exposes LLM rationale to CAND. |
| POST /api/interviews/:id/end | REC, CAND | Triggers finalize (idempotent). CAND end sets `endedBy:"candidate"`. |
| GET /api/interviews/:id/report | REC | 404 until completed. |

## 9. Voice Pipeline (backend/src/services/voice/)
Files: `voiceSession.js` (orchestrator, Map<interviewId, session>), `sttDeepgram.js`, `ttsDeepgram.js`, `turnManager.js`.
Flow: CAND audio track → rtc-node `AudioStream` → resample 16 kHz mono linear16 → Deepgram STT WS → TR events → turnManager → engine → TTS → `AudioSource` → published `LocalAudioTrack`.
- One session per IV. Starting again reuses it. Dispose on finalize (close WS, disconnect bot, clear timers).
- STT params: interim_results=true, endpointing, utterance_end_ms, vad_events, smart_format, encoding=linear16, sample_rate=16000. Model from `DEEPGRAM_STT_MODEL`.
- KeepAlive every ~8 s in silence. WS auto-reconnect with backoff (3 tries). Buffer audio during reconnect (≤5 s).
- Interim TRs go only to captions. Only the final merged TR (all `is_final` segments of the turn) triggers analysis. Interim text never touches Redis.
- TTS: sentence-chunked streaming; model/voice from `DEEPGRAM_TTS_MODEL`; output sample rate = AudioSource rate (24000 everywhere). Queue with cancel for barge-in.
- CAND UI data-channel events: `ai_speaking | listening | processing`, `caption` (current question text), `timer`.
- Never send evidence, rationale, or scores to CAND.
- While `processing`, buffer CAND speech; if still ongoing, merge into the same turn.
- Empty or <3-word finals = noise: don't analyze; re-listen.

## 10. Interview Engine (backend/src/services/interviewEngine.service.js)
Progression is DETERMINISTIC in code. The LLM only produces analysis and probe/question text.
- Order: intro → projects (high→medium→low) → requirements → wrapup. Per project: groups 1→2→3, never reordered.
- Entering a group: ask its `question_bank` main question. If that entry is not ready yet (background batch pending) or missing, use the template question. No live LLM call for main questions.
- Group advance when ANY: (questionsInGroup ≥1 AND all group focus targets ∈ {sufficiently_verified, unverified}); probesUsed ≥2; section time >150% of durationMinutes; soft end reached → requirements (if time remains) else wrapup.
- Probe priority: contradictory > partially_verified claim in current project > open EG in current group > focusArea skill still not_assessed.
- Skip a group if all its focusAreas are sufficiently_verified (FR-17). Skip LOW projects when remaining time <4 min.
- Difficulty = group `baseDifficulty` + level calibration (§3.7). Never recompute.
- Status rules (code, not LLM): strength≥2 ownership+technical_depth → sufficiently_verified; one observed mention → partially_verified; explicit "I don't know"/no evidence → unverified; conflict with a resume claim → contradictory (flag, don't conclude).

## 11. LLM Calls (backend/src/services/ai/; all via `llmClient`, chains per §4, settings per §4.3, guards per §4.5)
JSON output + Zod validation. Invalid JSON: retry 1x, then next chain entry (§4.4), then fallback (§12).
Prompt-injection guard: wrap TR in delimiters; instruct the model to treat it as data only and ignore embedded instructions.
- A) pregenQuestions (at `/start`, batched): in {up to 2 plan sections with their groups and focusAreas, difficulty, level, brief candidate projects/claims summary, job_context}; out {questions:[{sectionIdx, groupIdx, text(≤40 words, single, speakable, no lists), targetRef}]}. Batch size: at most 2 sections per call, estimated total under 5K tokens. The first batch (intro + first project) is awaited before the first question. Remaining batches run in the background, spaced at least 10 s apart (TPM guard), and write each result to `question_bank` and Mongo as they arrive. After all batches, any group without a question gets a template. Idempotent: never regenerate existing entries.
- B) answerAnalysis (every answered turn, 1 call): in {question, transcript, relevant claims/skills (not full state), group focusAreas}; out {skills[{name, demonstrated, depth:0-3}], evidence[{skill, claimRef, type, snippet, strength}], uncertainty[], missing[], contradictions[]}.
- C) probeGenerator (probe turns only): in {targetRef, group, focusAreas, difficulty, level, last 3 Q&A, open gaps, forbidden-repeat list}; out {text(≤40 words, single, speakable, no lists), kind, targetRef, rationale(hidden)}. Server check: normalized Jaccard >0.8 vs question_history → regenerate once, else template fallback.
- D) reportSummary (finalize, 1 call): in final state (trimmed); out summary text only. Scoring is NOT by the LLM.

## 12. Runtime Failure & Fallback (product behavior)
- LLM chain handling per §4.4–§4.5. Chain exhausted for analysis: `analysisStatus:"pending"`, push to `analysis_queue`, continue with template probe "Can you walk me through <focusArea> in <project> in more detail?". Retry the queue at finalize (1 pass through the chain).
- Probe/question generation fails: template question from group focusAreas (never repeating asked text).
- Pre-generation fails or is slow: fill `question_bank` with templates; the interview still starts.
- Report summary fails: deterministic summary built from state.
- Deepgram STT down after retries: AI says the connection was interrupted; pause IV; live-state `error` flag for REC.
- TTS fails: send the question as a data-channel caption plus text prompt; continue.
- Redis down: retry 3x, else `interview_status:error`; tell CAND "The interview state could not be saved. Retrying...".
- Never use "Something went wrong".

## 13. Finalization & Mongo Models
Finalize (`backend/src/services/finalizeInterview.service.js`), idempotent (guard on Mongo `completedAt`):
1. Lock, set `completing`. 2. Drain `analysis_queue`. 3. Compute final statuses (deterministic). 4. Build AssessmentReport (summary via §11-D). 5. Write Mongo (Interview.status=`completed`|`partial`, endedAt, endedBy) and verify. 6. `destroy()` Redis key (1 h TTL). 7. Dispose voice session. 8. Redis is never required after step 5.

Models (`backend/src/models/`):
- AssessmentReport: {interviewId, candidateId, candidateSummary, summaryText, skillsAssessed[{name, status, evidenceCount, snippets[]}], claims[{text, project, status, notes}], remainingGaps[], questionAnswerHistory[], coverage{sectionsDone, groupsDone}, durationMs, endedBy, partial:bool, generatedAt}
- InterviewTurn: {interviewId, seq, question, answer, evidence[], ts}
- Interview ADD: `live{startedAt, endedAt, consentAt, endedBy}`, `questionBank`.
- NO hire/reject recommendation, no numeric ranking (master PRD non-goal).

## 14. Env (backend/.env; fail fast at boot if missing)
Required: JWT_SECRET, MONGODB_URI, REDIS_URL, GOOGLE_GEMINI_API_KEY, GROQ_API_KEY, DEEPGRAM_API_KEY, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
Required with defaults: GROQ_BASE_URL (`https://api.groq.com/openai/v1`), GROQ_MODEL_ANALYSIS (`openai/gpt-oss-120b`), GROQ_MODEL_FAST (`openai/gpt-oss-20b`), GEMINI_FALLBACK_MODEL (`gemini-3.5-flash-lite`)
Optional: LLM_TIMEOUT_MS (8000), LLM_COOLDOWN_SECONDS (60), GROQ_REASONING_EFFORT (`low`), DEEPGRAM_STT_MODEL, DEEPGRAM_TTS_MODEL, MOCK_VOICE=true
Unchanged: the existing extraction model setting stays exactly as it is. Do not rename, move or repurpose it. Do not point it at the fallback model.
Frontend: VITE_API_BASE_URL, VITE_LIVEKIT_URL only. Never put secrets in the frontend.
Maintain `backend/.env.example` with all variable NAMES and no values. Ensure `.env` is in `.gitignore`.

## 15. Step Plan
Every step ends with STEP REPORT + CONTINUE PROMPT (§1).

### Stage A — Foundation (no audio)
**S0 Preflight & Env** [COMPLETED & VERIFIED ✓]
- Prereq: none. APIs: all.
- Build: `backend/scripts/preflight.js` (§2.2); boot env validation (§14); install deps.
- Gate: PASS for every API. Regression green.

**S1 Schema + Redis State Engine** [COMPLETED & VERIFIED ✓]
- Prereq: S0. APIs: Redis, MongoDB.
- Build: schema extensions, `redisState.service.js`, `normalizePriority()`.
- Gate: init from seeded IV; concurrent patches serialize; missing key rebuilds; legacy fields pass.

**S2 Models + Token/Consent/Start/End routes** [COMPLETED & VERIFIED ✓]
- Prereq: S1. APIs: LiveKit, Mongo.
- Build: AssessmentReport, InterviewTurn, Interview.live; routes with guards.
- Gate: early token → 400; no consent → 403; REC token has no publish grant; secret never in response.

### Stage B — Brain (text only)
**S3 Interview Engine** [COMPLETED & VERIFIED ✓]
- Prereq: S1. APIs: none (mocked LLM).
- Build: progression, probes, caps, redundancy, time rules, status rules.
- Gate: order high→med→low; 3 groups per project; probe cap 2; skip logic; soft/hard end; LOW skip; level calibration applied.

**S4 LLM Services & Provider Chain** [COMPLETED & VERIFIED ✓]
- Prereq: S3. The T-LLM smoke test passed with gpt-oss models. APIs: Groq, Gemini (fallback model only).
- Build:
  1. Env + preflight: GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL_ANALYSIS (`openai/gpt-oss-120b`), GROQ_MODEL_FAST (`openai/gpt-oss-20b`), GEMINI_FALLBACK_MODEL, GROQ_REASONING_EFFORT, LLM_* vars; preflight per §2.2. Zero references to deprecated Llama model ids.
  2. `llmClient` + `llmChains.js`: cooldown, retry, logging, `getLlmStats()`, gpt-oss handling (§4.3), token guards (§4.5).
  3. pregenQuestions (batched), answerAnalysis, probeGenerator, reportSummary with Zod, injection guard, Jaccard check.
  4. `question_bank` schema field + persistence.
  5. Redis update mapping (§3.5) and gap detection (§3.6).
- Gate: All gate criteria passed 100% in `backend/test_step_s4.js`. Extraction frozen. Regression green.

**S5 Text-Mode Dry Run** [COMPLETED & VERIFIED ✓]
- Prereq: S3, S4. APIs: Redis, Groq, Mongo (Gemini fallback tested).
- Build: `backend/scripts/textInterview.js`, CLI running a full IV with typed answers on real Redis + Groq; batched pre-generation at start; persists InterviewTurn rows.
- Gate: full interview completed (15 turns); order and probes correct; state valid every turn under Zod; no repeated questions (15 unique); per-stage timings logged; LLM budget report verified (Groq 120B ~11K tokens, Groq 20B ~10K tokens, Gemini fallback ~5.8K tokens). All regression tests green.

### Stage C — Voice
**S6 Finalization & Report** [COMPLETED & VERIFIED ✓]
- Prereq: S5. APIs: Mongo, Redis, Groq (summary, Gemini fallback).
- Build: `finalizeInterview.service.js`, report builder, idempotency guard, partial path, `/end` and `/report` wired.
- Gate: finalize twice = same result (idempotency verified); the report is correct with Redis wiped (verified); partial path works (verified); summary falls back to Gemini 3.5 and then to deterministic summary when forced (verified). All regression tests green.

**S7 Deepgram STT** [COMPLETED & VERIFIED ✓]
- Prereq: S2, S5. APIs: Deepgram STT.
- Build: `sttDeepgram.js`, `turnManager.js`: keepalive (8s pings), reconnect with backoff, buffering, merged final TR, noise filter (sub-threshold dropped), barge-in (>400ms during AI playback). Tested with 16kHz speech WAV fixture.
- Gate: WAV → expected final TR (verified); interim never writes state (verified); only final triggers analysis (verified); reconnect works after a forced WS close (verified). All regression tests green.

**S8 Deepgram TTS** [COMPLETED & VERIFIED ✓]
- Prereq: S2. APIs: Deepgram TTS.
- Build: `ttsDeepgram.js`: sentence-chunked streaming, 24 kHz linear16 synthesis, cancel queue mechanism for barge-in, 24 kHz WAV packaging, §12 caption fallback on failure.
- Gate: .wav intelligible and not chipmunk (exact 24000 Hz rate & RIFF format verified); cancel stops output immediately (verified); TTS failure → caption fallback with text preserved (verified). All regression tests green.

**S9 LiveKit Bot + Voice Loop** [COMPLETED & VERIFIED ✓]
- Prereq: S6, S7, S8. APIs: LiveKit, Deepgram, Groq, Redis.
- Build: `voiceSession.js`: rtc-node join, AudioStream→STT, engine→TTS→AudioSource, data-channel events, barge-in, silence/re-prompt (D3), singleton, disconnect/pause/resume (D8), timers (D5). Wire batched pre-generation into `/start`.
- Gate: a scripted participant speaks a WAV → the next question is audible on the bot track; barge-in cuts it off; duplicate `/start` creates one bot and does not regenerate questions; D6 timings logged (analysis latency of the gpt-oss reasoning model reported explicitly: 1110ms ≤ 3000ms target).

### Stage D — Frontend & Close-out
**S10 Frontend** [COMPLETED & VERIFIED ✓]
- Prereq: S9. APIs: LiveKit (browser), backend.
- Build: `LiveInterviewPage.jsx`: consent → mic permission → token → connect → `/start`; `room.startAudio()` on the user's click; states (connecting, reconnecting, AI speaking, listening, processing); mic denied → "Microphone access is required to start the interview."; show only caption and timer; headphones hint; minimal REC observer panel polling live-state every 3 s with an End button.
- Gate: manual browser run; no evidence/score/rationale in CAND DOM or network payloads; REC panel updates.

**S11 E2E & Hardening** [COMPLETED & VERIFIED ✓]
- Prereq: S10. APIs: all (live checklist).
- Build: `backend/test_phase3.js` (scripted IV, live and forced-failure paths: LLM, STT, TTS, Redis, disconnect), manual live checklist.
- Gate: §17 fully met.

**S12 Docs Sync (update all project .md files)** [COMPLETED & VERIFIED ✓]
- Prereq: S11. APIs: none.
- Scope: documentation only. No code changes. Update every markdown file that describes the project:
  1. Master `VoiceHire_AI_Final_PRD.md` (bump to v1.4, changelog, Groq gpt-oss primary, Gemini fallback, new schemas & models).
  2. `README.md` (root, backend, frontend) with full setup, preflight, test suite commands, rate limits.
  3. `backend/.env.example` verified with all variable names and no secrets.
  4. `VoiceHire_AI_Setup_and_Phase_Plan.md` marked COMPLETE with verified test instructions.
  5. `task_prd.md` marked COMPLETE with final acceptance checks.
- Gate: all markdown files synchronized with 0 stale references or deprecated models.

## 16. Known Pitfalls
- Deepgram closes idle WS after ~10 s without audio or KeepAlive.
- Sample rate/format mismatch → garbled audio. Resample explicitly.
- Browsers block audio without a user gesture.
- Concurrent turns corrupt state. Always take the lock.
- Duplicate `/start` creates two bots or regenerates questions. Use the singleton Map plus idempotency.
- Leaked bot/WS after finalize. Dispose in `finally`.
- Priority casing (`HIGH` vs `high`). Normalize once.
- Zod `.strict()` rejecting legacy fields. Use passthrough/optional.
- No raw PDFs, secrets, or full state in LiveKit metadata.
- Echo loop: the bot never subscribes to its own track; show a headphones hint.
- Hiding an API error behind a mock or silent provider swap (§2).
- Hardcoding a model name: read every model from env; preflight validates names. Groq gpt-oss ids need the `openai/` prefix.
- gpt-oss is a reasoning model: reasoning tokens count as output. A low `max_completion_tokens` yields truncated or empty JSON (`finish_reason: length`). Set `reasoning_effort: "low"` and a generous cap.
- Groq free limits are small: 8K TPM and 200K TPD per model, per organization. Oversized prompts or a whole-plan pre-generation call cause 429s. Batch, trim and guard (§4.5). Extra keys do not add capacity.
- Groq TPD is not in response headers; count it locally.
- Touching extraction: any change to its model, env variable or code breaks the freeze (§0). Using `GEMINI_MODEL` or a similar extraction variable for interview code is forbidden. Use `GEMINI_FALLBACK_MODEL`.
- Burning the extraction model's small daily quota with preflight or tests. Validate its name via list-models only.
- Gemini limits are per project and per model. Extra keys in the same project do not add quota.
- A cooled-down provider retried too early causes 429 storms. Honor `retry-after`.

## 17. Acceptance (Phase 3 done when ALL true)
- Every step S0–S12 reported PASS with the user's PROCEED recorded.
- CAND joins LiveKit with a backend-issued token only after REC ready and consent.
- Spoken answer → final TR → analysis → Redis update → next question audible, within D6 targets (or the gpt-oss latency shortfall is reported and accepted by the user).
- Order follows priority and the 3-group sequence; probes ≤2 per group; no repeated questions.
- skill_state and claim_verification use only the 6 evidence statuses and update per §10.
- Main questions are pre-generated in small batches at `/start`; a normal turn makes 1 LLM call; probe turns make 2.
- Groq models are `openai/gpt-oss-120b` and `openai/gpt-oss-20b`; no Llama ids remain.
- A forced Groq 429 (RPM, TPM or daily) falls through to the next entry and then to Gemini 3.5; a forced chain exhaustion still yields a next question; a forced `finish_reason: length` is retried and handled; a forced disconnect resumes within 60 s.
- Extraction code, model and env setting are unchanged (verified by diff).
- On end, MongoDB holds the full AssessmentReport and InterviewTurn rows; the report is correct with Redis wiped.
- CAND UI exposes no evidence, scores, or rationale.
- All APIs pass preflight; no unresolved API INCIDENT; the Groq addition is recorded in master PRD §9 (applied in S12).
- All project `.md` files updated (S12).
- `test_phase1.js`, `test_phase2.js`, `test_experience_prd.js`, `test_phase3.js` pass.

## 18. Phase Dependency Map
```text
PHASE 1 [COMPLETED & VERIFIED ✓]
Authentication (JWT + bcrypt + Single Session Concurrency + Password Reset)
Dashboards (Recruiter & Candidate)
Interview Scheduling & Gated Readiness State
       │
       ▼
PHASE 2 [COMPLETED & VERIFIED ✓]  (frozen; extraction model unchanged)
Resume/JD PDF Upload (Multer with validation)
  ↓ Gemini Direct Extraction (+ pdf-parse dynamic fallback)
  ↓ Simplified Experience Engine (inclusive months, company, years)
  ↓ MongoDB Persistence (Resume, JobDescription, Interview denormalization)
  ↓ Resume–JD Mapping & Project Priorities (HIGH / MED / LOW)
  ↓ 3-Group Interview Plan (Architecture, Implementation, Edge Cases)
  ↓ Recruiter Review Workspace (5-Tab Interactive Inspection & Overrides)
       │
       ▼
PHASE 3 [COMPLETED & VERIFIED ✓]
S0 Preflight → S1 Redis State → S2 Routes/Models → S3 Engine → S4 LLM Provider Chain → S5 Text Dry Run
→ S6 Finalize → S7 STT → S8 TTS → S9 LiveKit Bot Loop → S10 Frontend → S11 E2E → S12 Docs Sync
Runtime flow: LiveKit token → Deepgram STT → Groq gpt-oss analysis (Gemini 3.5 fallback) → Redis state (interview:state:<id>)
→ Evidence gap detection → Pre-generated main question or Groq probe → Deepgram TTS → MongoDB final assessment
```

## 19. Out of Scope
Deployment, RAG, hire/reject decisions, video/emotion analysis, ATS, recording storage/retention policy (until specified), any change to Phase 1–2 code or to the extraction model.

## Changelog
v1.5 | Phase 3 Complete (S0–S12 100% PASS). Finalized LiveKit voice loop, candidate UI privacy boundary, recruiter live-state observer panel, and master acceptance suite. Updated all project docs and .env.example.
v1.4 | Groq models changed to `openai/gpt-oss-120b` (analysis) and `openai/gpt-oss-20b` (fast) because the Llama models are deprecated; added Groq free-tier facts (30 RPM / 1K RPD / 8K TPM / 200K TPD per model) and capacity estimate; gpt-oss handling (reasoning effort, output caps, finish_reason retry); token guards (§4.5); batched pre-generation with first batch awaited and the rest in the background; extended S4 gate, S5/S11 tests, pitfalls and S12 docs scope.
v1.3 | Added §4 LLM provider matrix (Groq primary; Gemini 3.5 Flash-Lite fallback for all interview/evaluation agents; extraction frozen with its current model); question pre-generation + 1-call-per-turn; `question_bank`; cooldown/logging; Groq env + preflight; S4 rewritten; S12 Docs Sync; `.env.example`; quota discipline.
v1.2 | Restored full original Phase 3 spec; mandatory CONTINUE PROMPT after every step; START PHASE 3 trigger.
v1.1 | Added step-gated execution and API Failure Protocol.
v1.0 | Phase 3 task PRD created; gap defaults D1–D10 added.
