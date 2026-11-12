/**
 * VoiceHire AI — Turn Manager Service (Phase 3 Stage C — S7)
 *
 * Implements spec §3.3, §9 & D2:
 *  - Turn-taking lifecycle & candidate speech buffering
 *  - Merges finalized segments into clean full turn transcript
 *  - Strict state isolation: interim transcripts NEVER write state or trigger analysis
 *  - Only finalized turn transcript triggers answer analysis & Redis state update
 *  - Noise filter: suppresses empty/stray audio artifacts
 *  - Barge-in detection: speech >400ms during AI playback triggers barge-in event
 */

import { EventEmitter } from 'events';

export class TurnManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.noiseThresholdChars = options.noiseThresholdChars || 3;
    this.bargeInThresholdMs = options.bargeInThresholdMs || 400;
    this.utteranceSilenceTimeoutMs = options.utteranceSilenceTimeoutMs || 2800; // Increased break time by +1.6s for candidate thinking pauses

    this.isBotSpeaking = false;
    this.speechStartTime = null;
    this.speechStartedTimer = null;
    this.utteranceEndTimer = null;

    this.interimBuffer = '';
    this.finalSegments = [];
    this.turnStartTime = null;
  }

  /**
   * Sets AI bot speaking status (for barge-in monitoring)
   */
  setBotSpeaking(speaking) {
    this.isBotSpeaking = Boolean(speaking);
    if (!this.isBotSpeaking) {
      if (this.speechStartedTimer) {
        clearTimeout(this.speechStartedTimer);
        this.speechStartedTimer = null;
      }
    }
  }

  /**
   * Handles SpeechStarted event from VAD
   */
  handleSpeechStarted() {
    this.speechStartTime = Date.now();
    if (!this.turnStartTime) {
      this.turnStartTime = Date.now();
    }

    // Cancel any pending utterance end timer
    if (this.utteranceEndTimer) {
      clearTimeout(this.utteranceEndTimer);
      this.utteranceEndTimer = null;
    }

    // Barge-in check (D2: candidate speech >400ms during TTS)
    if (this.isBotSpeaking) {
      this.speechStartedTimer = setTimeout(() => {
        if (this.isBotSpeaking && this.speechStartTime) {
          const speechDuration = Date.now() - this.speechStartTime;
          if (speechDuration >= this.bargeInThresholdMs) {
            this.emit('bargeIn', { speechDurationMs: speechDuration });
          }
        }
      }, this.bargeInThresholdMs);
    }
  }

  /**
   * Handles transcript event from Deepgram
   */
  handleTranscript({ text, isFinal, isSpeechFinal }) {
    if (!text || !text.trim()) return;

    const trimmed = text.trim();

    if (!isFinal) {
      // 1. Interim Transcript: Emitted for live UI captioning ONLY
      // GUARANTEE: Never writes to state, never triggers analysis
      this.interimBuffer = trimmed;
      this.emit('interim', {
        text: trimmed,
        isInterim: true,
        persisted: false // Explicit indicator that state was untouched
      });
      return;
    }

    // 2. Finalized Segment: Buffer for full turn assembly
    this.interimBuffer = '';
    if (!this.finalSegments.includes(trimmed)) {
      this.finalSegments.push(trimmed);
    }

    this.emit('finalSegment', {
      segment: trimmed,
      totalSegments: this.finalSegments.length
    });

    // If Deepgram flags speech_final, start safety timer for 1200ms per D2
    if (isSpeechFinal) {
      if (this.utteranceEndTimer) clearTimeout(this.utteranceEndTimer);
      this.utteranceEndTimer = setTimeout(() => {
        this.handleUtteranceEnd();
      }, this.utteranceSilenceTimeoutMs);
    }
  }

  /**
   * Handles UtteranceEnd event (1200ms silence detected after speech)
   * This is the ONLY place where a completed turn transcript is emitted!
   */
  handleUtteranceEnd() {
    if (this.utteranceEndTimer) {
      clearTimeout(this.utteranceEndTimer);
      this.utteranceEndTimer = null;
    }

    const mergedTranscript = this.finalSegments.join(' ').trim();

    // Noise filter: ignore if below threshold
    if (!mergedTranscript || mergedTranscript.length < this.noiseThresholdChars) {
      this.resetTurn();
      return;
    }

    const durationMs = this.turnStartTime ? Math.max(0, Date.now() - this.turnStartTime) : 0;

    // Emit final turn transcript — ONLY this triggers analysis!
    this.emit('turnComplete', {
      transcript: mergedTranscript,
      durationMs,
      segmentsCount: this.finalSegments.length
    });

    this.resetTurn();
  }

  /**
   * Resets internal turn buffers
   */
  resetTurn() {
    this.interimBuffer = '';
    this.finalSegments = [];
    this.turnStartTime = null;
    this.speechStartTime = null;
    if (this.speechStartedTimer) {
      clearTimeout(this.speechStartedTimer);
      this.speechStartedTimer = null;
    }
    if (this.utteranceEndTimer) {
      clearTimeout(this.utteranceEndTimer);
      this.utteranceEndTimer = null;
    }
  }
}

export default TurnManager;

