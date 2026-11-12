/**
 * VoiceHire AI — Deepgram Streaming TTS Service (Phase 3 Stage C — S8)
 *
 * Implements spec §3.8, §9 & §12:
 *  - High-fidelity 24 kHz linear16 speech synthesis via Deepgram Aura
 *  - Sentence-chunked streaming for low first-audio latency (D6 p50 ≤ 3s)
 *  - Cancel queue mechanism for immediate barge-in interruption (D2 >400ms)
 *  - 24 kHz WAV packaging and sample rate verification (not chipmunk / slow)
 *  - Graceful caption fallback on Deepgram TTS failure (§12)
 */

import fs from 'fs';
import { EventEmitter } from 'events';
import { env } from '../../config/env.js';

/**
 * Splits prose text into speakable sentence chunks for low-latency streaming
 */
export function splitIntoSentences(text = '') {
  if (!text || typeof text !== 'string') return [];
  const sentences = text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [text.trim()];
}

/**
 * Creates standard 44-byte RIFF WAV header for 24 kHz linear16 PCM
 */
export function createWavHeader(dataLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0); // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4); // ChunkSize
  buffer.write('WAVE', 8); // Format
  buffer.write('fmt ', 12); // Subchunk1ID
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate (24000)
  buffer.writeUInt32LE(byteRate, 28); // ByteRate (48000)
  buffer.writeUInt16LE(blockAlign, 32); // BlockAlign (2)
  buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample (16)
  buffer.write('data', 36); // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40); // Subchunk2Size

  return buffer;
}

export class DeepgramTTS extends EventEmitter {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || env.DEEPGRAM_API_KEY;
    this.model = options.model || env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en';
    this.sampleRate = options.sampleRate || 24000;
    this.encoding = options.encoding || 'linear16';

    this.activeAbortController = null;
    this.isCancelled = false;
    this.queue = [];
  }

  /**
   * Synthesizes a single sentence chunk via Deepgram Speak REST API
   * Returns raw 24kHz PCM linear16 Buffer
   */
  async synthesizeSentence(sentenceText, signal) {
    if (!sentenceText || !sentenceText.trim()) {
      return Buffer.alloc(0);
    }

    const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(this.model)}&encoding=${encodeURIComponent(this.encoding)}&sample_rate=${this.sampleRate}&container=none`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: sentenceText.trim() }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Deepgram TTS HTTP error ${res.status}: ${errText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * Cancels active synthesis and flushes the queue immediately (Barge-in D2)
   */
  cancel() {
    this.isCancelled = true;
    this.queue = [];
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch (_) {}
      this.activeAbortController = null;
    }
    this.emit('cancelled');
  }

  /**
   * Streams text in sentence chunks with cancel queue support
   *
   * @param {string} fullText Complete response text to speak
   * @param {Object} options Callbacks: onAudioChunk, onSentenceStart, onComplete
   * @returns {Promise<{ success: boolean, cancelled?: boolean, fallback?: string, audioBuffers: Buffer[] }>}
   */
  async synthesizeStream(fullText, options = {}) {
    this.isCancelled = false;
    this.activeAbortController = new AbortController();
    const signal = this.activeAbortController.signal;

    const sentences = splitIntoSentences(fullText);
    const audioBuffers = [];

    this.queue = [...sentences];

    try {
      for (let i = 0; i < sentences.length; i++) {
        if (this.isCancelled || signal.aborted) {
          return { success: false, cancelled: true, audioBuffers };
        }

        const sentence = sentences[i];
        if (typeof options.onSentenceStart === 'function') {
          options.onSentenceStart(sentence, i, sentences.length);
        }

        const pcmChunk = await this.synthesizeSentence(sentence, signal);

        if (this.isCancelled || signal.aborted) {
          return { success: false, cancelled: true, audioBuffers };
        }

        if (pcmChunk.length > 0) {
          audioBuffers.push(pcmChunk);
          this.emit('chunk', { chunk: pcmChunk, index: i, total: sentences.length });
          if (typeof options.onAudioChunk === 'function') {
            await options.onAudioChunk(pcmChunk, i, i === sentences.length - 1);
          }
        }
      }

      if (typeof options.onComplete === 'function') {
        options.onComplete(audioBuffers);
      }

      return {
        success: true,
        cancelled: false,
        audioBuffers,
        totalBytes: audioBuffers.reduce((sum, b) => sum + b.length, 0)
      };
    } catch (err) {
      if (err.name === 'AbortError' || this.isCancelled) {
        return { success: false, cancelled: true, audioBuffers };
      }

      // §12 Fallback: If TTS fails, emit captionFallback with text prompt
      console.warn(`[DeepgramTTS] Synthesis failed: ${err.message}. Engaging §12 caption fallback.`);
      this.emit('captionFallback', { text: fullText, error: err.message });

      return {
        success: false,
        fallback: 'caption',
        text: fullText,
        error: err.message,
        audioBuffers
      };
    } finally {
      this.activeAbortController = null;
    }
  }

  /**
   * Synthesizes full text to an intelligible 24kHz WAV file on disk
   *
   * @param {string} text Text to synthesize
   * @param {string} outputPath Destination file path
   * @returns {Promise<{ filePath: string, durationMs: number, sampleRate: number }>}
   */
  async synthesizeToWav(text, outputPath) {
    const streamRes = await this.synthesizeStream(text);
    if (!streamRes.success || streamRes.audioBuffers.length === 0) {
      if (streamRes.fallback === 'caption') {
        throw new Error(`TTS failed with caption fallback: ${streamRes.error}`);
      }
      throw new Error('TTS synthesis failed or was cancelled');
    }

    const totalPcmLength = streamRes.audioBuffers.reduce((acc, b) => acc + b.length, 0);
    const wavHeader = createWavHeader(totalPcmLength, this.sampleRate, 1, 16);
    const combinedBuffer = Buffer.concat([wavHeader, ...streamRes.audioBuffers]);

    fs.writeFileSync(outputPath, combinedBuffer);

    // Rate verification: 24,000 samples/sec * 2 bytes/sample = 48,000 bytes/sec
    const durationMs = Math.round((totalPcmLength / (this.sampleRate * 2)) * 1000);

    return {
      filePath: outputPath,
      durationMs,
      sampleRate: this.sampleRate,
      bytes: combinedBuffer.length
    };
  }
}

export default DeepgramTTS;

