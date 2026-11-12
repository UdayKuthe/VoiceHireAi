import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Room, RoomEvent, createLocalAudioTrack } from 'livekit-client';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import {
  Mic,
  MicOff,
  Volume2,
  Headphones,
  Clock,
  Radio,
  AlertCircle,
  CheckCircle2,
  PhoneOff,
  Sparkles,
  Loader2,
  ShieldCheck,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';

export const LiveInterviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Pre-join & Lifecycle States: 'consent' | 'mic_check' | 'ready_to_start' | 'in_interview' | 'ended'
  const [stage, setStage] = useState('consent');
  const [consentGiven, setConsentGiven] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [micError, setMicError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');

  // LiveKit Session & Voice States
  // States per spec: 'connecting' | 'reconnecting' | 'ai_speaking' | 'listening' | 'processing'
  const [voiceState, setVoiceState] = useState('connecting');
  const [currentCaption, setCurrentCaption] = useState('Connecting to VoiceHire AI Interviewer...');
  const [questionKind, setQuestionKind] = useState('main');
  const [isMuted, setIsMuted] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(60);

  // Timer: elapsed seconds
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // References
  const roomRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const audioElRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const reconnectIntervalRef = useRef(null);

  // 1. Consent Confirmation Handler
  const handleConsentSubmit = async () => {
    setActionLoading(true);
    setGeneralError('');
    try {
      await api.submitConsent(id);
      setConsentGiven(true);
      setStage('mic_check');
    } catch (err) {
      setGeneralError(err.message || 'Failed to record consent.');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Microphone Permission Request Handler
  const handleRequestMic = async () => {
    setMicError('');
    setActionLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop temporary track once permission is verified; LiveKit will open local track
      stream.getTracks().forEach((t) => t.stop());
      setMicGranted(true);
      setStage('ready_to_start');
    } catch (err) {
      // Mandatory PRD error message string
      setMicError('Microphone access is required to start the interview.');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. User Gesture: Start Audio & Connect Room
  const handleStartInterview = async () => {
    setActionLoading(true);
    setGeneralError('');
    setVoiceState('connecting');
    setStage('in_interview');

    try {
      // Fetch LiveKit connection token
      const tokenRes = await api.getLiveToken(id);
      const { token, url } = tokenRes;

      const room = new Room({
        adaptiveStream: true,
        dynacast: true
      });
      roomRef.current = room;

      // Event: Remote track subscribed (Bot speech)
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === 'audio' && audioElRef.current) {
          track.attach(audioElRef.current);
        }
      });

      // Event: Track unsubscribed
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
      });

      // Event: Data Channel Messages from Bot
      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const str = new TextDecoder().decode(payload);
          const data = JSON.parse(str);

          if (data.type === 'caption' && data.text) {
            setCurrentCaption(data.text);
            if (data.kind) setQuestionKind(data.kind);
          } else if (data.type === 'state' && data.status) {
            setVoiceState(data.status);
          } else if (data.type === 'speaking') {
            setVoiceState(data.isSpeaking ? 'ai_speaking' : 'listening');
          } else if (data.type === 'barge_in') {
            setVoiceState('listening');
          }
        } catch (e) {
          // Ignore unparseable data-channel messages
        }
      });

      // Event: Reconnecting / Disconnected (D8: 60s pause grace)
      room.on(RoomEvent.Reconnecting, () => {
        setVoiceState('reconnecting');
        startReconnectCountdown();
      });

      room.on(RoomEvent.Reconnected, () => {
        stopReconnectCountdown();
        setVoiceState('listening');
      });

      room.on(RoomEvent.Disconnected, () => {
        setVoiceState('reconnecting');
        startReconnectCountdown();
      });

      // Connect to LiveKit Room
      await room.connect(url, token);

      // Crucial: Unlock browser audio playback via explicit user gesture
      await room.startAudio();

      // Create and publish candidate microphone track
      const localTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      });
      localAudioTrackRef.current = localTrack;
      await room.localParticipant.publishTrack(localTrack);

      // Start elapsed timer
      startElapsedTimer();

      // Signal backend to spawn/init voice session & greet
      const startRes = await api.startInterviewSession(id);
      if (startRes?.state?.interview_state?.current_question?.text) {
        setCurrentCaption(startRes.state.interview_state.current_question.text);
      }
      setVoiceState('connecting');
    } catch (err) {
      setGeneralError(err.message || 'Unable to connect to interview room.');
      setVoiceState('connecting');
      setStage('ready_to_start');
    } finally {
      setActionLoading(false);
    }
  };

  // Reconnection countdown helper
  const startReconnectCountdown = () => {
    if (reconnectIntervalRef.current) return;
    setReconnectCountdown(60);
    reconnectIntervalRef.current = setInterval(() => {
      setReconnectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(reconnectIntervalRef.current);
          reconnectIntervalRef.current = null;
          handleLeaveInterview(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopReconnectCountdown = () => {
    if (reconnectIntervalRef.current) {
      clearInterval(reconnectIntervalRef.current);
      reconnectIntervalRef.current = null;
    }
  };

  // Timer helpers
  const startElapsedTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Toggle Mute
  const toggleMute = () => {
    if (localAudioTrackRef.current) {
      if (isMuted) {
        localAudioTrackRef.current.unmute();
        setIsMuted(false);
      } else {
        localAudioTrackRef.current.mute();
        setIsMuted(true);
      }
    }
  };

  // Leave / End Interview
  const handleLeaveInterview = async (autoEnded = false) => {
    if (!autoEnded && !window.confirm('Are you sure you want to conclude this interview session?')) {
      return;
    }

    try {
      await api.endInterview(id);
    } catch (err) {
      console.warn('End interview notification notice:', err.message);
    }

    // Cleanup tracks & room
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);

    setStage('ended');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localAudioTrackRef.current) localAudioTrackRef.current.stop();
      if (roomRef.current) roomRef.current.disconnect();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    };
  }, []);

  // UI state banner & visualizer helpers
  const getStateBadge = () => {
    switch (voiceState) {
      case 'ai_speaking':
        return {
          label: 'AI Interviewer Speaking',
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-400 animate-pulse'
        };
      case 'listening':
        return {
          label: 'Listening to You',
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
          dot: 'bg-indigo-400 animate-ping'
        };
      case 'processing':
        return {
          label: 'Processing Response...',
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400 animate-spin'
        };
      case 'reconnecting':
        return {
          label: `Reconnecting (${reconnectCountdown}s)`,
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dot: 'bg-rose-400 animate-ping'
        };
      default:
        return {
          label: 'Connecting...',
          color: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
          dot: 'bg-slate-400'
        };
    }
  };

  const badge = getStateBadge();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Hidden audio element for LiveKit playback */}
      <audio ref={audioElRef} autoPlay />

      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (stage === 'in_interview') {
                handleLeaveInterview();
              } else {
                navigate('/candidate');
              }
            }}
            className="p-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Leave Session"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white m-0">VoiceHire AI Interview</h1>
            <p className="text-xs text-slate-400 m-0">Candidate Session • ID: {id?.slice(-8)}</p>
          </div>
        </div>

        {stage === 'in_interview' && (
          <div className="flex items-center gap-4">
            {/* Timer */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono font-semibold">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>

            {/* Live State Badge */}
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
              <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-4xl mx-auto w-full">
        {/* Error Alert */}
        {generalError && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs max-w-md w-full text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{generalError}</span>
          </div>
        )}

        {/* STEP 1: Consent Screen */}
        {stage === 'consent' && (
          <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-left space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white m-0">Candidate Consent & Instructions</h2>
                <p className="text-xs text-slate-400 m-0">Please review before entering the audio room</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-3">
              <p className="m-0 leading-relaxed">
                Welcome, <strong className="text-white">{user?.name}</strong>. This technical interview is conducted in real-time by VoiceHire AI’s conversational interviewer.
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-slate-400">
                <li>Your spoken answers are transcribed and analyzed for evidence of technical experience.</li>
                <li>You can interrupt or speak naturally at any point (barge-in supported).</li>
                <li>Audio is processed securely and retained only for evaluation by the hiring team.</li>
              </ul>
            </div>

            {/* Headphones Hint (Mandatory PRD) */}
            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-start gap-2.5 text-xs text-indigo-300">
              <Headphones className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
              <span>
                <strong>Headphones Recommended:</strong> Please wear headphones or earphones during the session to eliminate acoustic echo and ensure clear audio transcription.
              </span>
            </div>

            <button
              onClick={handleConsentSubmit}
              disabled={actionLoading}
              className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>I Consent & Agree to Proceed</span>
            </button>
          </div>
        )}

        {/* STEP 2: Mic Check Gate */}
        {stage === 'mic_check' && (
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
              <Mic className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-white mb-1">Microphone Verification</h2>
              <p className="text-xs text-slate-400">VoiceHire AI requires access to your microphone to conduct the voice interview.</p>
            </div>

            {micError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                {/* Verbatim error per spec */}
                <span>{micError}</span>
              </div>
            )}

            <button
              onClick={handleRequestMic}
              disabled={actionLoading}
              className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              <span>Allow Microphone Access</span>
            </button>
          </div>
        )}

        {/* STEP 3: Ready to Start (User Gesture Required for Audio Playback) */}
        {stage === 'ready_to_start' && (
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <Volume2 className="w-8 h-8 animate-pulse" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-white mb-1">Ready to Connect</h2>
              <p className="text-xs text-slate-400">Your microphone is configured. Click below to start the interview audio stream.</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
              <Headphones className="w-4 h-4 text-indigo-400" />
              <span>Headphones connected & ready</span>
            </div>

            <button
              onClick={handleStartInterview}
              disabled={actionLoading}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Start Voice Interview</span>
            </button>
          </div>
        )}

        {/* STEP 4: Active Interview Screen (Strict Privacy: Only Caption & Timer) */}
        {stage === 'in_interview' && (
          <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800 rounded-3xl p-8 md:p-10 shadow-2xl relative overflow-hidden backdrop-blur-xl flex flex-col items-center">
            {/* Visualizer Glow Ring */}
            <div className="relative mb-8 flex items-center justify-center">
              <div
                className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
                  voiceState === 'ai_speaking'
                    ? 'bg-emerald-500/20 ring-8 ring-emerald-500/30 scale-105 shadow-2xl shadow-emerald-500/30'
                    : voiceState === 'listening'
                    ? 'bg-indigo-500/20 ring-4 ring-indigo-500/20 scale-100 shadow-xl shadow-indigo-500/20'
                    : 'bg-amber-500/20 ring-2 ring-amber-500/20'
                }`}
              >
                {voiceState === 'ai_speaking' ? (
                  <Volume2 className="w-12 h-12 text-emerald-400 animate-pulse" />
                ) : voiceState === 'processing' ? (
                  <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
                ) : (
                  <Mic className="w-12 h-12 text-indigo-400" />
                )}
              </div>
            </div>

            {/* Reconnecting Grace Countdown Banner (D8) */}
            {voiceState === 'reconnecting' && (
              <div className="w-full mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                <span>Connection interrupted. Reconnecting... (Grace period: {reconnectCountdown}s remaining)</span>
              </div>
            )}

            {/* Current Question Caption (Only caption shown to candidate — strictly no scores/evidence/rationale) */}
            <div className="w-full min-h-[120px] p-6 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-center items-center mb-8">
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">
                {questionKind === 'probe' ? 'Follow-up Probe' : 'Question'}
              </span>
              <p className="text-base md:text-lg font-medium text-slate-100 leading-relaxed max-w-xl m-0">
                "{currentCaption}"
              </p>
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={toggleMute}
                className={`p-3.5 rounded-full border transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-750'
                }`}
                title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={() => handleLeaveInterview(false)}
                className="py-3 px-6 rounded-2xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-600/20"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Interview</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Concluded Screen */}
        {stage === 'ended' && (
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-white mb-1">Interview Completed</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Thank you for your time. Your responses have been submitted to the recruitment team for evaluation.
              </p>
            </div>

            <button
              onClick={() => navigate('/candidate')}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              Return to Candidate Dashboard
            </button>
          </div>
        )}
      </main>

      {/* Footer: Headphones hint */}
      <footer className="border-t border-slate-850 py-3 px-6 text-center text-[11px] text-slate-500 flex items-center justify-center gap-2">
        <Headphones className="w-3.5 h-3.5 text-slate-400" />
        <span>VoiceHire AI Voice Session • Headphones recommended to prevent audio echo</span>
      </footer>
    </div>
  );
};

export default LiveInterviewPage;

