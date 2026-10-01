# AGENT TASK: VoiceHire AI — Phase 1 (Dashboards, Auth, Basic Interaction)

Build the Phase 1 foundation only. No AI, LLM, PDF, Redis, LiveKit, STT or TTS code. Local dev only.

## Stack (fixed)
- Frontend: React + Vite, Tailwind, shadcn/ui, React Router
- Backend: Node.js + Express
- DB: MongoDB (Mongoose)
- Auth: JWT, bcrypt password hashing
- Structure: `/client`, `/server`; server split into routes / controllers / models / middleware / services; centralized `config/env.js`

## Env
- server/.env: PORT=5000, MONGODB_URI=mongodb://127.0.0.1:27017/voicehire, JWT_SECRET
- client/.env: VITE_API_BASE_URL=http://localhost:5000
- Provide `.env.example` files. Add `.env` to `.gitignore`. No secrets in the frontend.

## Data Models
User: name, email (unique), passwordHash, role (`RECRUITER`|`CANDIDATE`), createdAt, resetToken?, resetTokenExpiry?
Interview: title, candidateId (ref User), recruiterId (ref User), scheduledAt, status, recruiterReady (bool, default false), candidateReady (bool, default false), createdAt
Status enum: `draft`, `scheduled`, `reminder`, `recruiter_ready`, `candidate_ready`, `live`, `completed`, `cancelled`

## Status Logic
- Create → `scheduled` (or `draft` if no scheduledAt)
- `reminder`: derived, shown when scheduledAt is within 30 min and the interview is not yet ready/live
- Recruiter marks Ready → recruiterReady=true, `recruiter_ready`
- Candidate joins (only when recruiterReady=true) → candidateReady=true; `live` once both are ready
- Recruiter can mark `completed` or `cancelled`
- Recruiter can un-ready (toggle) before `live`
- Validate all transitions server-side

## API (all under /api, JSON)
Auth:
- POST /auth/register {name,email,password,role}
- POST /auth/login → {token,user}
- POST /auth/logout
- POST /auth/forgot-password → logs reset token to console
- POST /auth/reset-password {token,newPassword}
- GET /auth/me

Recruiter (role RECRUITER):
- GET /candidates → users with role CANDIDATE
- POST /interviews {title,candidateId,scheduledAt}
- GET /interviews → own interviews
- PATCH /interviews/:id/ready {ready:boolean}
- PATCH /interviews/:id/status {status: completed|cancelled}

Candidate (role CANDIDATE):
- GET /candidate/interviews → own interviews
- POST /candidate/interviews/:id/join → allowed only if recruiterReady

## Middleware
- `authenticate` (verify JWT), `requireRole(role)`
- Ownership checks: recruiters touch only their own interviews; candidates only their own
- Specific error messages; no generic "Something went wrong"

## Frontend
Routes: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/recruiter/*`, `/candidate/*`
- ProtectedRoute with role-based redirect after login; block cross-role access
- Auth context stores token and user

Recruiter Dashboard:
- Layout with sidebar (Overview, Candidates, Interviews)
- Candidate list
- "Create Interview" button → form (title, candidate select, date/time)
- Upcoming interviews as status cards: Title, Candidate, Time, Status badge, [Mark Ready / Unready], [Complete], [Cancel]

Candidate Dashboard:
- Profile (name, email)
- Upcoming interview card: Title, date/time, status badge, "Recruiter: Ready ✓" / "Not ready", reminder banner when within 30 min
- [Join Interview] disabled until recruiter is ready
- Interview history (completed)
- After join: placeholder "Interview room" page (no AI)
- Poll /candidate/interviews every 5s for readiness; recruiter dashboard polls too

UI: clean, responsive, inline form validation, loading skeletons, specific error states.

## Constraints
- Do not add Redis, Gemini, Deepgram, LiveKit, file upload, or RAG
- Never expose passwordHash or resetToken in responses
- Modular code; reusable components

## Done when
1. Recruiter registers/logs in → lands on the Recruiter Dashboard; the candidate cannot open `/recruiter/*` (and vice versa)
2. Recruiter creates and schedules an interview for a candidate; it appears with the correct status
3. Recruiter marks Ready → candidate dashboard shows "Recruiter: Ready ✓" within ~5s, and Join becomes enabled
4. Candidate joins → interview goes `live`; recruiter can mark `completed`
5. Password reset works via the console-logged token
6. Server rejects invalid transitions and unauthorized access with specific errors

## Process
Plan the file tree first, then implement backend → frontend. Run both servers and smoke-test the flow above. After the initial scaffold, edit with minimal diffs; do not read unrelated files.