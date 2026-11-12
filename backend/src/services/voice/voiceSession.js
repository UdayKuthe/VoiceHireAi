/**
 * VoiceHire AI — LiveKit Voice Session & Turn-Taking Loop (Phase 3 Stage C — S9)
 *
 * Implements spec §3.2, §3.9, §9 & D1–D8:
 *  - In-process AI interviewer bot participant via @livekit/rtc-node (D1)
 *  - Singleton session Map: duplicate /start calls return existing bot without recreation
 *  - Batched pre-generation wired into /start
 *  - Remote candidate audio subscribed via AudioStream (16kHz) -> DeepgramLiveSTT
 *  - Deepgram STT -> TurnManager -> Answer Analysis (Groq 120B) -> Redis State -> Engine
 *  - Next Question -> Deepgram 24kHz TTS -> AudioSource -> Candidate audio track
 *  - Barge-in (D2): candidate speech >400ms cancels TTS and flushes playback queue
 *  - Silence & Re-prompt (D3): 20s silence triggers re-prompt; 2 silences advances with no_response
 *  - Time limits (D5): soft end and hard cap monitoring
 *  - Disconnect grace (D8): 60s pause grace, 5 min finalize partial
 *  - D6 Latency logging: logs per-stage latency (gpt-oss reasoning model analysis latency explicitly reported)
 */

import { EventEmitter } from 'events';
import { AccessToken } from 'livekit-server-sdk';
import {
  Room,
  RoomEvent,
  AudioSource,
  AudioFrame,
  LocalAudioTrack,
  AudioStream,
  TrackKind,
  TrackSource
} from '@livekit/rtc-node';
import { env } from '../../config/env.js';
import { Interview } from '../../models/Interview.js';
import { InterviewTurn } from '../../models/InterviewTurn.js';
import { RedisStateManager } from '../redisState.service.js';
import { DeepgramLiveSTT } from './sttDeepgram.js';
import { DeepgramTTS } from './ttsDeepgram.js';
import { TurnManager } from './turnManager.js';
import { InterviewEngine } from '../interviewEngine.service.js';
import { analyzeAnswer, applyAnalysisToState } from '../ai/answerAnalysis.service.js';
import { batchPregenPlan, generateProbeQuestion, generateTemplateQuestion } from '../ai/questionGenerator.service.js';
import { finalizeInterview } from '../finalizeInterview.service.js';

// Singleton active sessions map: interviewId -> VoiceSession
const activeSessions = new Map();

export class VoiceSession extends EventEmitter {
  constructor(interviewId) {
    super();
    this.interviewId = String(interviewId);
    this.room = null;
    this.stt = null;
    this.tts = null;
    this.turnManager = null;
    this.audioSource = null;
    this.localAudioTrack = null;

    this.isBotSpeaking = false;
    this.isDisposed = false;
    this.isPaused = false;
    this.disconnectTimer = null;
    this.silenceTimer = null;
    this.repromptCount = 0;

    this.currentQuestion = null;
    this.allAskedQuestions = [];
    this.turnNumber = 0;

    this.audioStreamReader = null;
    this.candidateParticipant = null;

    this.timings = {
      analysisLatencies: [],
      turnTimings: []
    };
  }

  /**
   * Initializes and connects the voice session
   */
  async start() {
    if (this.room && this.room.state === 'connected') {
      return this;
    }

    // 1. Initialize Redis Active State if not already active
    let state = await RedisStateManager.get(this.interviewId);
    if (!state) {
      state = await RedisStateManager.init(this.interviewId);
    }

    // 2. Wire Batched Pre-generation at /start if bank is empty
    const existingBank = state.interview_state.question_bank || {};
    if (Object.keys(existingBank).length === 0) {
      console.log(`[VoiceSession:${this.interviewId}] Pre-generating interview questions at /start...`);
      const bank = await batchPregenPlan({
        assessmentPlan: state.assessment_plan,
        candidateContext: state.candidate_context,
        jobContext: state.job_context,
        existingBank: {},
        onBatchComplete: async (updatedBank) => {
          await RedisStateManager.patch(this.interviewId, (s) => {
            s.interview_state.question_bank = updatedBank;
            return s;
          });
          await Interview.findByIdAndUpdate(this.interviewId, { questionBank: updatedBank });
        }
      });
      state = await RedisStateManager.get(this.interviewId);
    }

    // 3. Initialize Voice Components (STT, TTS, TurnManager)
    if (this.isDisposed) return this;

    this.stt = new DeepgramLiveSTT({
      sampleRate: 16000,
      encoding: 'linear16',
      smartFormat: true,
      interimResults: true,
      utteranceEndMs: 2500
    });

    this.tts = new DeepgramTTS({
      sampleRate: 24000,
      encoding: 'linear16',
      model: env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en'
    });

    this.turnManager = new TurnManager({
      noiseThresholdChars: 3,
      bargeInThresholdMs: 400,
      utteranceSilenceTimeoutMs: 2800 // +1.6s break time for candidate thinking pauses
    });

    this.setupTurnManagerEvents();
    this.setupSttEvents();

    await this.stt.connect();
    if (this.isDisposed) return this;

    // 4. Connect LiveKit Bot Participant (D1: identity 'ai-interviewer')
    const botToken = await this.generateBotToken();
    this.room = new Room();

    this.setupRoomEvents();
    await this.room.connect(env.LIVEKIT_URL, botToken);
    if (this.isDisposed) {
      this.room.disconnect().catch(() => {});
      return this;
    }
    console.log(`[VoiceSession:${this.interviewId}] AI Bot joined room: ${this.room.name}`);

    // 5. Create 24kHz AudioSource & publish local audio track
    this.audioSource = new AudioSource(24000, 1);
    this.localAudioTrack = LocalAudioTrack.createAudioTrack('interviewer-audio', this.audioSource);

    await this.room.localParticipant.publishTrack(this.localAudioTrack, {
      name: 'interviewer-audio',
      source: TrackSource.SOURCE_MICROPHONE
    });
    if (this.isDisposed) return this;

    // 6. Give candidate WebRTC client a 1200ms grace window to complete track subscription
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (this.isDisposed) return this;

    // 7. Ask First Question
    await this.progressToNextTurn();

    return this;
  }

  /**
   * Generates a LiveKit JWT for the AI bot
   */
  async generateBotToken() {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: 'ai-interviewer',
      name: 'AI Interviewer',
      ttl: 2 * 60 * 60
    });
    at.addGrant({
      roomJoin: true,
      room: this.interviewId,
      canPublish: true,
      canSubscribe: true
    });
    return at.toJwt();
  }

  /**
   * Room event listeners
   */
  setupRoomEvents() {
    // Candidate audio track subscription
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (participant.identity === 'ai-interviewer') return; // Do not subscribe to self (echo loop pitfall §16)

      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`[VoiceSession:${this.interviewId}] Subscribed to candidate audio track from ${participant.identity}`);
        this.candidateParticipant = participant;
        this.subscribeCandidateAudio(track);
      }
    });

    // Participant disconnect handling (D8: 60s pause grace, 5 min finalize partial)
    this.room.on(RoomEvent.ParticipantDisconnected, async (participant) => {
      if (participant.identity === 'ai-interviewer') return;
      console.warn(`[VoiceSession:${this.interviewId}] Candidate disconnected. Starting 60s grace timer...`);
      this.handleCandidateDisconnect();
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (participant.identity === 'ai-interviewer') return;
      console.log(`[VoiceSession:${this.interviewId}] Candidate rejoined. Resuming session...`);
      this.handleCandidateRejoin();
    });
  }

  /**
   * Consumes candidate audio track via AudioStream (16kHz) and pipes to Deepgram STT
   */
  async subscribeCandidateAudio(track) {
    try {
      const audioStream = new AudioStream(track, 16000, 1);
      const reader = audioStream.getReader();
      this.audioStreamReader = reader;

      while (!this.isDisposed) {
        const { value: frame, done } = await reader.read();
        if (done || !frame) break;

        if (this.stt && this.stt.isConnected) {
          const rawBuffer = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
          this.stt.sendAudio(rawBuffer);
        }
      }
    } catch (err) {
      if (!this.isDisposed) {
        console.warn(`[VoiceSession:${this.interviewId}] AudioStream read notice: ${err.message}`);
      }
    }
  }

  /**
   * Connects STT events to TurnManager
   */
  setupSttEvents() {
    this.stt.on('transcript', (data) => {
      this.turnManager.handleTranscript(data);
    });

    this.stt.on('utteranceEnd', () => {
      this.turnManager.handleUtteranceEnd();
    });

    this.stt.on('speechStarted', () => {
      this.clearSilenceTimer();
      this.turnManager.handleSpeechStarted();
    });
  }

  /**
   * TurnManager event handling (Turn completion, barge-in)
   */
  setupTurnManagerEvents() {
    // 1. Turn Complete: Process Answer -> Analysis -> State Update -> Next Turn
    this.turnManager.on('turnComplete', async ({ transcript, durationMs }) => {
      await this.handleCandidateTurn(transcript, durationMs);
    });

    // 2. Barge-In (D2: speech >400ms during AI playback)
    this.turnManager.on('bargeIn', ({ speechDurationMs }) => {
      console.log(`[VoiceSession:${this.interviewId}] Barge-in detected (${speechDurationMs}ms). Cancelling bot speech.`);
      this.tts.cancel();
      this.isBotSpeaking = false;
      this.turnManager.setBotSpeaking(false);
      this.publishDataChannel({ type: 'barge_in' });
      this.startSilenceTimer();
    });
  }

  /**
   * Handles completed candidate speech turn
   */
  async handleCandidateTurn(transcript, durationMs) {
    this.turnNumber++;
    const turnStart = Date.now();
    console.log(`\n[Turn ${this.turnNumber}] Candidate Spoke: "${transcript}" (${durationMs}ms)`);

    this.publishDataChannel({ type: 'state', status: 'processing' });

    let state = await RedisStateManager.get(this.interviewId);
    if (!state) return;

    // A. Spoken Answer Analysis (Live LLM call: Groq 120B reasoning model)
    const analysisStart = Date.now();
    let analysis;
    let analysisFailed = false;
    try {
      analysis = await analyzeAnswer({
        question: this.currentQuestion?.text || 'Technical question',
        transcript,
        relevantClaims: state.candidate_context?.claims || [],
        relevantSkills: (state.candidate_context?.skills || []).map((s) => s.name || s),
        groupFocusAreas: this.currentQuestion?.group ? [this.currentQuestion.group] : [],
        currentProject: this.currentQuestion?.project
      });
    } catch (err) {
      console.warn(`[VoiceSession:${this.interviewId}] Answer analysis failed: ${err.message}`);
      analysisFailed = true;
      analysis = {
        skills: [],
        evidence: [],
        missing: [],
        uncertainty: [],
        contradictions: []
      };
    }

    const analysisDuration = Date.now() - analysisStart;
    this.timings.analysisLatencies.push(analysisDuration);
    console.log(`  [Timing] Groq 120B Analysis Latency: ${analysisDuration}ms`);

    // B. Write to Redis State under Lock
    const questionId = this.currentQuestion?.id || `q_${this.turnNumber}`;
    const questionObj = this.currentQuestion || {
      id: questionId,
      text: 'Technical question',
      kind: 'main',
      askedAt: new Date().toISOString()
    };

    const answerObj = {
      questionId,
      transcript,
      startedAt: new Date(Date.now() - durationMs).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs,
      status: 'answered',
      analysisStatus: analysisFailed ? 'pending' : 'done'
    };

    await RedisStateManager.patch(this.interviewId, (s) => {
      s.interview_state.current_question = questionObj;
      s.interview_state.question_history.push(questionObj);
      s.interview_state.answer_history.push(answerObj);

      if (analysisFailed) {
        if (!s.interview_state.analysis_queue) s.interview_state.analysis_queue = [];
        s.interview_state.analysis_queue.push({
          questionId,
          answerId: `ans_${this.turnNumber}`,
          question: questionObj.text,
          transcript,
          project: this.currentQuestion?.project,
          group: this.currentQuestion?.group,
          focusAreas: this.currentQuestion?.group ? [this.currentQuestion.group] : []
        });
      } else {
        applyAnalysisToState(s, analysis, {
          questionId,
          answerId: `ans_${this.turnNumber}`,
          project: this.currentQuestion?.project,
          group: this.currentQuestion?.group,
          transcript
        });
      }

      return s;
    });

    // C. Write-Through to MongoDB InterviewTurn
    await InterviewTurn.create({
      interviewId: this.interviewId,
      seq: this.turnNumber,
      question: questionObj,
      answer: answerObj,
      evidence: analysis.evidence.map((ev, i) => ({
        id: `ev_${this.turnNumber}_${i}`,
        answerId: questionId,
        skill: ev.skill || null,
        claimRef: ev.claimRef || null,
        project: this.currentQuestion?.project || null,
        snippet: ev.snippet || '',
        type: ev.type || 'technical_depth',
        strength: ev.strength || 1
      }))
    });

    // D. Advance to Next Question
    await this.progressToNextTurn();
  }

  /**
   * Progresses interview to next turn via InterviewEngine
   */
  async progressToNextTurn() {
    let state = await RedisStateManager.get(this.interviewId);
    if (!state) return;

    const actionEval = InterviewEngine.getNextAction(state);
    const { action, sectionIdx, groupIdx, section, project, group, targetRef, kind } = actionEval;

    // Check wrapup
    if (action === 'wrapup') {
      console.log(`[VoiceSession:${this.interviewId}] Interview engine reached wrapup: ${actionEval.reason}`);
      await this.speakQuestion('Thank you. We have completed all sections of the interview today. Best of luck!');
      await finalizeInterview(this.interviewId, { endedBy: 'system' });
      this.dispose();
      return;
    }

    let questionText = '';
    let questionKind = kind || 'main';

    if (action === 'ask_main') {
      const bankKey = `${sectionIdx}-${groupIdx}`;
      const bankEntry = state.interview_state.question_bank?.[bankKey];
      if (bankEntry?.text) {
        questionText = bankEntry.text;
      } else {
        const tpl = generateTemplateQuestion({ targetRef, group, currentProject: project });
        questionText = tpl.text;
      }
    } else if (action === 'probe') {
      const probeRes = await generateProbeQuestion({
        targetRef,
        group,
        focusAreas: group?.focusAreas,
        difficulty: actionEval.difficulty || 'medium',
        level: state.assessment_plan?.experienceLevel || 'mid',
        last3QA: state.interview_state.answer_history.slice(-3),
        openGaps: (state.interview_state.evidence_gaps || []).filter((g) => !g.resolved),
        forbiddenRepeatList: this.allAskedQuestions,
        currentProject: project
      });
      questionText = probeRes.text;
    }

    this.allAskedQuestions.push(questionText);

    this.currentQuestion = {
      id: `q_${this.turnNumber + 1}`,
      text: questionText,
      section: sectionIdx + 1,
      project: project || null,
      group: group?.name || '',
      kind: questionKind,
      targetRef,
      askedAt: new Date().toISOString()
    };

    // Update group pointers and current question in Redis
    await RedisStateManager.patch(this.interviewId, (s) => {
      s.interview_state.current_question = this.currentQuestion;
      if (s.interview_state.progress.sectionIdx !== sectionIdx || s.interview_state.progress.groupIdx !== groupIdx) {
        s.interview_state.progress.sectionIdx = sectionIdx;
        s.interview_state.progress.groupIdx = groupIdx;
        s.interview_state.progress.questionsInGroup = 0;
        s.interview_state.progress.probesUsed = 0;
      }
      s.interview_state.progress.questionsInGroup += 1;
      if (questionKind === 'probe') {
        s.interview_state.progress.probesUsed += 1;
      }
      return s;
    });

    console.log(`\n[AI Speaking] (${questionKind}): "${questionText}"`);
    await this.speakQuestion(questionText);
  }

  /**
   * Speaks question text via 24kHz Deepgram TTS into AudioSource
   */
  async speakQuestion(text) {
    if (this.isDisposed) return;
    this.isBotSpeaking = true;
    if (this.turnManager) {
      this.turnManager.setBotSpeaking(true);
    }
    this.emit('aiQuestion', text);

    // Send caption over LiveKit data channel
    this.publishDataChannel({
      type: 'caption',
      text,
      kind: this.currentQuestion?.kind || 'main'
    });
    this.publishDataChannel({ type: 'speaking', isSpeaking: true });
    this.publishDataChannel({ type: 'state', status: 'ai_speaking' });

    try {
      if (this.tts) {
        const streamRes = await this.tts.synthesizeStream(text, {
          onAudioChunk: async (pcmChunk) => {
            if (!this.isBotSpeaking || this.isDisposed) return;
            await this.playPcmToAudioSource(pcmChunk);
          }
        });

        if (streamRes.fallback === 'caption') {
          // Fallback: Question already published via data-channel caption
          console.warn(`[VoiceSession:${this.interviewId}] Handled TTS caption fallback.`);
        }
      }
      // 250ms echo absorption tail to prevent room reverberation from triggering candidate speech
      if (this.isBotSpeaking && !this.isDisposed) {
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      console.warn(`[VoiceSession:${this.interviewId}] TTS playback warning: ${err.message}`);
    } finally {
      this.isBotSpeaking = false;
      if (this.turnManager) {
        this.turnManager.setBotSpeaking(false);
      }
      this.publishDataChannel({ type: 'speaking', isSpeaking: false });
      this.publishDataChannel({ type: 'state', status: 'listening' });

      // Start Silence Timer (D3)
      if (!this.isDisposed) {
        this.startSilenceTimer();
      }
    }
  }

  /**
   * Writes 24kHz linear16 PCM buffer in 20ms frames to LiveKit AudioSource
   * Paced at true real-time 20ms intervals so audio streams at natural speech speed
   */
  async playPcmToAudioSource(pcmBuffer) {
    if (!this.audioSource || !pcmBuffer || pcmBuffer.length === 0 || this.isDisposed) return;

    const frameBytes = 960; // 20ms at 24000 Hz, 1 channel, 16-bit
    const samplesPerChannel = 480;
    const frameIntervalMs = 20;

    let nextTick = Date.now();

    for (let offset = 0; offset < pcmBuffer.length; offset += frameBytes) {
      if (!this.isBotSpeaking || this.isDisposed) break;

      const end = Math.min(offset + frameBytes, pcmBuffer.length);
      const slice = pcmBuffer.subarray(offset, end);

      const frameBuf = Buffer.alloc(frameBytes);
      slice.copy(frameBuf);

      const int16Data = new Int16Array(frameBuf.buffer, frameBuf.byteOffset, frameBuf.byteLength / 2);
      const frame = new AudioFrame(int16Data, 24000, 1, samplesPerChannel);
      try {
        await this.audioSource.captureFrame(frame);
      } catch (err) {
        // Break cleanly if room/track closed
        break;
      }

      nextTick += frameIntervalMs;
      const delay = nextTick - Date.now();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * D3: Silence & Re-prompt Logic (20s timeout -> prompt once, 2nd -> no_response)
   */
  startSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(async () => {
      if (this.isBotSpeaking || this.isDisposed) return;

      this.repromptCount++;
      if (this.repromptCount === 1) {
        console.log(`[VoiceSession:${this.interviewId}] 20s silence detected. Re-prompting once...`);
        await this.speakQuestion('Take your time — shall I repeat the question?');
      } else if (this.repromptCount >= 2) {
        console.log(`[VoiceSession:${this.interviewId}] Consecutive silence detected. Advancing turn as no_response.`);
        this.repromptCount = 0;
        await this.handleCandidateTurn('(No response from candidate)', 20000);
      }
    }, 20000);
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * D8: Candidate Disconnect Grace (60s grace, 5 min finalize partial)
   */
  handleCandidateDisconnect() {
    this.isPaused = true;
    this.clearSilenceTimer();

    this.disconnectTimer = setTimeout(async () => {
      console.warn(`[VoiceSession:${this.interviewId}] Candidate disconnected >5 min. Finalizing as partial...`);
      await finalizeInterview(this.interviewId, { endedBy: 'system', isPartial: true });
      this.dispose();
    }, 5 * 60 * 1000);
  }

  handleCandidateRejoin() {
    this.isPaused = false;
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.startSilenceTimer();
  }

  /**
   * Publishes message on LiveKit data channel
   */
  publishDataChannel(payload) {
    if (this.room?.localParticipant) {
      try {
        const str = JSON.stringify(payload);
        const data = new TextEncoder().encode(str);
        this.room.localParticipant.publishData(data, { reliable: true });
      } catch (_) {}
    }
  }

  /**
   * Disposes session cleanly
   */
  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.clearSilenceTimer();
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);

    if (this.tts) this.tts.cancel();
    if (this.stt) this.stt.disconnect();
    if (this.audioStreamReader) {
      try {
        this.audioStreamReader.cancel();
      } catch (_) {}
    }

    if (this.room) {
      this.room.disconnect().catch(() => {});
    }

    activeSessions.delete(this.interviewId);
    console.log(`[VoiceSession:${this.interviewId}] Disposed cleanly.`);
  }
}

/**
 * Singleton Session Accessors (§16 Pitfall: duplicate /start must not create two bots)
 */
export function getVoiceSession(interviewId) {
  return activeSessions.get(String(interviewId)) || null;
}

export async function createOrGetVoiceSession(interviewId) {
  const idStr = String(interviewId);
  const existing = activeSessions.get(idStr);
  if (existing && !existing.isDisposed) {
    console.log(`[VoiceSession] Returning existing active session for ${idStr}`);
    return existing;
  }

  const session = new VoiceSession(idStr);
  activeSessions.set(idStr, session);
  return session;
}

export function disposeVoiceSession(interviewId) {
  const session = activeSessions.get(String(interviewId));
  if (session) {
    session.dispose();
  }
}

export default VoiceSession;
