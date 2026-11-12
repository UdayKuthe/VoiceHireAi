# VoiceHire AI — Frontend Application 💻🎙️

The VoiceHire AI frontend is a modern single-page application built with **React 19**, **Vite**, **Tailwind CSS v4**, and **LiveKit Client**. It implements strict role-based UX separation for **Recruiters** and **Candidates**.

---

## 🏗️ Architecture & Pages

### 1. Authentication
- `LoginPage.jsx` / `RegisterPage.jsx`: JWT authentication, role selection (`RECRUITER` or `CANDIDATE`).
- `ForgotPasswordPage.jsx` / `ResetPasswordPage.jsx`: Token-based password recovery.
- `ProtectedRoute.jsx`: Enforces role-based route guards and handles unauthorized session events.

### 2. Recruiter Portal
- `RecruiterDashboard.jsx`: Candidate directory, interview scheduler, and readiness status toggle.
- `InterviewDetailPage.jsx`:
  - 5-tab inspection workspace:
    1. **Resume Data**: Parsed experience, sanitized companies/dates, and recruiter level override.
    2. **JD Requirements**: Parsed skills, competencies, and role qualifications.
    3. **Skill Mapping**: Matched, partial, and missing skills with project priority badges.
    4. **Interview Plan**: 3-group project-first interview plan (Architecture, Implementation, Edge Cases).
    5. **Live Observer**: Real-time telemetry panel (`RecruiterObserverPanel.jsx`) polling live session state every 3 seconds with session termination control.

### 3. Candidate Experience
- `CandidateDashboard.jsx`: Profile overview, upcoming interviews, readiness indicator, and gated join action.
- `LiveInterviewPage.jsx` (`InterviewRoomPage.jsx`):
  - **Stage 1 (Consent Gate)**: Candidate review & explicit audio consent (`POST /api/interviews/:id/consent`).
  - **Stage 2 (Mic Verification)**: Browser media device verification (`navigator.mediaDevices.getUserMedia`). Rejection outputs verbatim: `"Microphone access is required to start the interview."`.
  - **Stage 3 (User Gesture Audio Unlock)**: Browser requirement to unlock audio stream (`room.startAudio()`).
  - **Stage 4 (Active Interview)**: Real-time LiveKit WebRTC session with Deepgram audio loop.
    - **Voice State Machine**: `connecting`, `reconnecting`, `ai_speaking`, `listening`, `processing`.
    - **Strict Privacy Rule**: Renders ONLY the current spoken question caption and elapsed timer. Under no circumstances are evidence gaps, competency evaluations, or internal LLM rationales rendered.
    - **Disconnect Grace Banner**: Displays 60s countdown banner during network reconnection before pausing.
    - **Headphones Hint**: Clear recommendation to prevent acoustic feedback.

---

## 🛠️ Environment Configuration

Create `.env` in the `frontend/` directory:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_LIVEKIT_URL=wss://your-livekit-project.livekit.cloud
```

---

## 🏃 Running Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

Build for production:
```bash
npm run build
```
