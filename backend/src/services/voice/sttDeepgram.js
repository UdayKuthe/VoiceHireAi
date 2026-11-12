/**
 * VoiceHire AI — Deepgram Streaming STT Service (Phase 3 Stage C — S7)
 *
 * Implements spec §3.3, §9, §16 & D2:
 *  - Live streaming WebSocket to Deepgram STT (nova-2)
 *  - 16kHz / 48kHz linear16 audio chunk streaming
 *  - KeepAlive pings every 8s to prevent 10s idle WS timeout
 *  - Auto-reconnection with exponential backoff on unexpected close/error
 *  - Emits events: 'open', 'transcript', 'utteranceEnd', 'speechStarted', 'close', 'error'
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { env } from '../../config/env.js';

export class DeepgramLiveSTT extends EventEmitter {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || env.DEEPGRAM_API_KEY;
    this.model = options.model || env.DEEPGRAM_STT_MODEL || 'nova-2';
    this.sampleRate = options.sampleRate || 16000;
    this.encoding = options.encoding || 'linear16';
    this.smartFormat = options.smartFormat !== false;
    this.interimResults = options.interimResults !== false;
    this.utteranceEndMs = options.utteranceEndMs || 2500;
    this.vadEvents = options.vadEvents !== false;
    this.endpointing = options.endpointing || 300;

    this.keepAliveIntervalMs = options.keepAliveIntervalMs || 8000;
    this.autoReconnect = options.autoReconnect !== false;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;

    this.ws = null;
    this.keepAliveTimer = null;
    this.reconnectAttempts = 0;
    this.isExplicitlyClosed = false;
    this.isConnected = false;
  }

  /**
   * Builds the Deepgram WebSocket URL with query params
   */
  getWsUrl() {
    const params = new URLSearchParams({
      model: this.model,
      encoding: this.encoding,
      sample_rate: String(this.sampleRate),
      smart_format: String(this.smartFormat),
      interim_results: String(this.interimResults),
      utterance_end_ms: String(this.utteranceEndMs),
      vad_events: String(this.vadEvents),
      endpointing: String(this.endpointing)
    });
    return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  }

  /**
   * Opens WebSocket connection to Deepgram
   */
  async connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;

    return new Promise((resolve, reject) => {
      try {
        const url = this.getWsUrl();
        this.ws = new WebSocket(url, {
          headers: {
            Authorization: `Token ${this.apiKey}`
          }
        });

        let settled = false;

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startKeepAlive();
          this.emit('open');
          if (!settled) {
            settled = true;
            resolve();
          }
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (err) => {
          this.emit('error', err);
          if (!settled) {
            settled = true;
            reject(err);
          }
        });

        this.ws.on('close', (code, reason) => {
          this.isConnected = false;
          this.stopKeepAlive();
          this.emit('close', { code, reason: reason?.toString() });

          if (!this.isExplicitlyClosed && this.autoReconnect) {
            this.handleAutoReconnect();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Internal message handler for Deepgram responses
   */
  handleMessage(raw) {
    try {
      const data = JSON.parse(raw.toString());

      // 1. Transcription results
      if (data.type === 'Results' || data.channel) {
        const channel = data.channel || data.results?.channels?.[0];
        const alternative = channel?.alternatives?.[0];
        const transcript = alternative?.transcript || '';
        const isFinal = Boolean(data.is_final);
        const isSpeechFinal = Boolean(data.speech_final);
        const confidence = alternative?.confidence || 0;

        this.emit('transcript', {
          text: transcript,
          isFinal,
          isSpeechFinal,
          confidence,
          words: alternative?.words || []
        });
      }

      // 2. UtteranceEnd event (1200ms silence detected after speech per D2)
      if (data.type === 'UtteranceEnd') {
        this.emit('utteranceEnd');
      }

      // 3. SpeechStarted event (VAD trigger)
      if (data.type === 'SpeechStarted') {
        this.emit('speechStarted');
      }
    } catch (err) {
      this.emit('error', new Error(`Failed to parse Deepgram message: ${err.message}`));
    }
  }

  /**
   * Sends audio buffer to Deepgram
   */
  sendAudio(chunk) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(chunk);
    this.resetKeepAlive();
    return true;
  }

  /**
   * Sends explicit KeepAlive control message
   */
  sendKeepAlive() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }

  /**
   * Starts periodic KeepAlive timer
   */
  startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      this.sendKeepAlive();
    }, this.keepAliveIntervalMs);
  }

  /**
   * Stops periodic KeepAlive timer
   */
  stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Resets KeepAlive timer on active audio send
   */
  resetKeepAlive() {
    this.startKeepAlive();
  }

  /**
   * Sends Finalize frame to flush pending audio
   */
  finalizeStream() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'Finalize' }));
    }
  }

  /**
   * Handles auto-reconnect with exponential backoff
   */
  async handleAutoReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error(`Deepgram STT reconnection failed after ${this.reconnectAttempts} attempts`));
      return;
    }

    this.reconnectAttempts++;
    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs });

    setTimeout(async () => {
      try {
        await this.connect();
        this.emit('reconnected', { attempt: this.reconnectAttempts });
      } catch (err) {
        // Reconnect error will trigger close and next attempt
      }
    }, delayMs);
  }

  /**
   * For testing: abruptly closes the socket without setting isExplicitlyClosed
   */
  forceCloseForTest() {
    if (this.ws) {
      this.ws.terminate();
    }
  }

  /**
   * Closes connection cleanly
   */
  disconnect() {
    this.isExplicitlyClosed = true;
    this.stopKeepAlive();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export default DeepgramLiveSTT;

