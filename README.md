# VoiceHire AI 🎙️🤖

> **Next-Generation Real-Time, Voice-Based Adaptive Technical Interview Platform**

VoiceHire AI is an intelligent interview platform that conducts dynamic, personalized voice interviews. Rather than relying on a static questionnaire, it treats the interview as an **evolving evidence-acquisition process**. It analyzes candidate resumes and job descriptions directly via multimodal LLMs, maintains live candidate evidence states, detects evidence gaps, and adaptively decides follow-up questions in real time.

---

## 🌟 Key Highlights

- **Multimodal LLM Document Processing**: Direct PDF-to-structured-data analysis for resumes and JDs without brittle legacy NLP regexes or skill extraction pipelines.
- **Adaptive Evidence Engine**: Live interview state tracks demonstrated skills, project claims, verification status, and detected evidence gaps.
- **Real-Time Voice Streaming**: Ultra-low-latency voice conversation powered by LiveKit and Deepgram streaming STT/TTS.
- **Dual-Dashboard Architecture**: Distinct, purpose-built interfaces for **Recruiters** (candidate management, JD/resume review, scheduling, evaluation reports) and **Candidates** (simple, distraction-free voice interview experience).
- **Dual-Layer State Management**: High-speed ephemeral state tracking in Redis during live sessions; durable historical records and final assessment reports persisted in MongoDB.

---

## 🔄 Core Product Loop

```text
Resume PDF + Job Description PDF
           ↓
   Google Gemini 2.5/Pro (Multimodal Direct PDF Extraction)
           ↓
   Structured Resume & JD Data
           ↓
   Resume–JD Skill & Requirement Mapping
           ↓
   Personalized Interview Plan (Projects → Tech → Claims)
           ↓
   Real-Time Voice Interview (LiveKit WebRTC)
           ↓
   Candidate Speech → Streaming STT (Deepgram)
           ↓
   LLM Answer & Evidence Analysis
           ↓
   Update Live Interview State (Redis)
           ↓
   Detect Unresolved Evidence Gaps
           ↓
   Adaptive Question Generation & Selection
           ↓
   Streaming TTS (Deepgram) → LiveKit Audio Stream
           ↓
   Candidate Hears Follow-Up Question ↺
           ↓
   (Post-Interview) Persist to MongoDB & Generate Final Assessment Report
```

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React.js + Vite | Modern, high-performance SPA |
| **Styling & UI** | Tailwind CSS + shadcn/ui | Clean, accessible design system |
| **Backend** | Node.js + Express.js | REST APIs & session orchestration |
| **Real-Time Audio** | LiveKit | Low-latency WebRTC audio transport |
| **Speech-to-Text** | Deepgram STT | Real-time WebSocket streaming transcription |
| **Text-to-Speech** | Deepgram TTS | Natural-sounding low-latency streaming audio |
| **LLM & PDF Intelligence**| Google Gemini API | Multimodal document extraction & adaptive reasoning |
| **Active Session State** | Redis | In-memory working state for sub-second updates |
| **Persistent Storage** | MongoDB | Durable store for users, profiles, plans, and reports |
| **Authentication** | JWT + bcrypt | Role-based access control (`RECRUITER`, `CANDIDATE`) |

---

## 📂 Project Structure

```text
VoiceHireAI/
├── frontend/                     # React + Vite application
│   ├── src/
│   │   ├── components/           # Reusable UI & shadcn components
│   │   ├── pages/
│   │   │   ├── auth/             # Login, Register, Forgot Password
│   │   │   ├── recruiter/        # Recruiter dashboard, candidate list, setup
│   │   │   └── candidate/        # Candidate dashboard, live interview room
│   │   ├── services/             # Axios API clients, LiveKit integration
│   │   ├── hooks/                # Custom React hooks
│   │   └── App.jsx
│   └── .env
│
├── backend/                      # Node.js + Express application
│   ├── src/
│   │   ├── config/               # DB (MongoDB, Redis), third-party clients
│   │   ├── controllers/          # API route controllers
│   │   ├── middleware/           # Auth, role guard, error handling, upload
│   │   ├── models/               # Mongoose schemas (User, Interview, Report, etc.)
│   │   ├── routes/               # API route definitions
│   │   ├── services/
│   │   │   ├── auth/             # Authentication & token services
│   │   │   ├── extraction/       # Gemini PDF document parsing
│   │   │   ├── interview/        # State machine & gap detection engine
│   │   │   ├── voice/            # LiveKit & Deepgram STT/TTS coordination
│   │   │   └── assessment/       # Report generation
│   │   └── app.js
│   └── .env
│
├── uploads/                      # Temporary local storage for uploaded PDFs
│   ├── resumes/
│   └── jds/
│
├── VoiceHire_AI_Final_PRD.md     # Comprehensive Product Requirements Document
├── VoiceHire_AI_Setup_and_Phase_Plan.md # Setup instructions & detailed roadmap
└── README.md
```

---

## 🚀 Development Roadmap

Implementation follows a three-phase approach: **Platform → Understanding → Adaptive Voice**.

### **Phase 1: Foundation, Dashboards & Authentication**
- [ ] User authentication with JWT and role-based routing (`RECRUITER` vs. `CANDIDATE`).
- [ ] Recruiter Dashboard: Candidate list, interview shell creation, schedule time, readiness status.
- [ ] Candidate Dashboard: Profile overview, upcoming interviews, interviewer ready status, join button.
- [ ] Interview scheduling & status lifecycle (`Draft` → `Scheduled` → `Ready` → `Live` → `Completed`).

### **Phase 2: Resume/JD Extraction & Interview Planning**
- [ ] PDF upload handling (Multer) for resumes and job descriptions.
- [ ] Gemini API direct multimodal parsing (zero regex/OCR pipeline).
- [ ] Extraction of candidates, projects, skills, claims, and JD requirements into structured JSON.
- [ ] Automated Resume–JD mapping (strong matches, partial matches, gaps).
- [ ] Project-first interview plan generation with recruiter review UI.

### **Phase 3: Real-Time Voice Interview & State Management**
- [ ] LiveKit audio room integration.
- [ ] Deepgram bidirectional streaming (STT transcribe candidate speech, TTS stream questions).
- [ ] Redis working-state engine tracking answers, evidence verification, and skill coverage.
- [ ] Dynamic evidence-gap detection and adaptive next-question generation.
- [ ] Interview completion handler and comprehensive post-interview assessment report in MongoDB.

---

## ⚙️ Prerequisites & Local Setup

### 1. System Requirements
- **Node.js**: v18+ LTS
- **MongoDB**: Local MongoDB Community Server running on `mongodb://127.0.0.1:27017`
- **Redis**: Local Redis instance or Memurai running on `redis://127.0.0.1:6379`
- **Browser**: Modern Chrome or Edge with microphone permissions

### 2. External API Accounts
- [Google AI Studio](https://aistudio.google.com/) (Gemini API Key)
- [Deepgram Console](https://console.deepgram.com/) (Deepgram API Key)
- [LiveKit Cloud](https://cloud.livekit.io/) (URL, API Key, API Secret)

### 3. Environment Variables Configuration

#### Backend (`backend/.env`):
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/voicehire
REDIS_URL=redis://127.0.0.1:6379

GOOGLE_GEMINI_API_KEY=your_gemini_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key

LIVEKIT_URL=https://your-livekit-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

JWT_SECRET=your_secure_jwt_secret
```

#### Frontend (`frontend/.env`):
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_LIVEKIT_URL=https://your-livekit-project.livekit.cloud
```

---

## 📖 In-Depth Documentation

For thorough architectural and planning specifications, refer to:
- [VoiceHire AI Final PRD](./VoiceHire_AI_Final_PRD.md)
- [VoiceHire AI Setup & Phase Plan](./VoiceHire_AI_Setup_and_Phase_Plan.md)

---

## 📄 License

This project is licensed under the MIT License.
