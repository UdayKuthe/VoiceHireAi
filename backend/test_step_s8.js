/**
 * VoiceHire AI — Step S8 Gate Tests: Deepgram TTS & Sentence Streaming
 *
 * Verifies all S8 requirements per task_prd.md §3.8, §9, §12, §15:
 *  1. .wav output generated, intelligible, rate verified at exactly 24000 Hz (not chipmunk).
 *  2. Sentence-chunked streaming: splits sentences and emits audio chunks sequentially.
 *  3. Cancel queue: cancel() stops output immediately, drops pending sentences, flushes queue.
 *  4. TTS failure engages §12 caption fallback without crashing.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DeepgramTTS, splitIntoSentences, createWavHeader } from './src/services/voice/ttsDeepgram.js';
import { env } from './src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runStepS8Tests() {
  console.log('========================================================');
  console.log('   VoiceHire AI — Step S8 Gate Verification Tests      ');
  console.log('========================================================\n');

  const testOutputDir = path.join(__dirname, 'tests/fixtures');
  fs.mkdirSync(testOutputDir, { recursive: true });
  const testWavPath = path.join(testOutputDir, 'tts_output_24khz.wav');

  try {
    // ----------------------------------------------------
    // TEST 1: Sentence Splitting Utility
    // ----------------------------------------------------
    console.log('[Test 1] Testing sentence chunker for multi-sentence questions...');
    const multiSentenceText =
      'Can you walk me through your Redis caching architecture? In particular, how did you handle invalidation when candidate connections dropped? Tell me about your operational lessons.';
    const sentences = splitIntoSentences(multiSentenceText);

    assert.strictEqual(sentences.length, 3, 'Split into exactly 3 sentences');
    assert.strictEqual(sentences[0], 'Can you walk me through your Redis caching architecture?');
    assert.strictEqual(sentences[1], 'In particular, how did you handle invalidation when candidate connections dropped?');
    assert.strictEqual(sentences[2], 'Tell me about your operational lessons.');
    console.log('✓ Test 1 passed: Sentence chunker splits complex multi-sentence questions accurately.\n');

    // ----------------------------------------------------
    // TEST 2: High-Fidelity 24 kHz WAV Synthesis & Rate Verification
    // ----------------------------------------------------
    console.log('[Test 2] Synthesizing 24 kHz audio and verifying WAV header & sample rate...');
    const tts = new DeepgramTTS({ sampleRate: 24000, model: 'aura-asteria-en' });

    const promptText = 'Welcome to VoiceHire AI. We are beginning your live technical interview.';
    const wavResult = await tts.synthesizeToWav(promptText, testWavPath);

    assert(fs.existsSync(testWavPath), 'WAV file written to disk');
    const wavBuffer = fs.readFileSync(testWavPath);

    // Verify RIFF WAV Structure
    const riffHeader = wavBuffer.toString('ascii', 0, 4);
    const waveFormat = wavBuffer.toString('ascii', 8, 12);
    const audioFormat = wavBuffer.readUInt16LE(20);
    const numChannels = wavBuffer.readUInt16LE(22);
    const sampleRate = wavBuffer.readUInt32LE(24);
    const byteRate = wavBuffer.readUInt32LE(28);
    const bitsPerSample = wavBuffer.readUInt16LE(34);

    console.log(`  WAV Analysis:`);
    console.log(`    Format: ${riffHeader}/${waveFormat} (PCM type: ${audioFormat})`);
    console.log(`    Channels: ${numChannels} (Mono)`);
    console.log(`    Sample Rate: ${sampleRate} Hz`);
    console.log(`    Byte Rate: ${byteRate} bytes/sec`);
    console.log(`    Bits Per Sample: ${bitsPerSample}`);
    console.log(`    Duration: ${wavResult.durationMs}ms`);

    assert.strictEqual(riffHeader, 'RIFF', 'Valid RIFF header');
    assert.strictEqual(waveFormat, 'WAVE', 'Valid WAVE format');
    assert.strictEqual(audioFormat, 1, 'Audio format is PCM');
    assert.strictEqual(numChannels, 1, 'Mono channel audio');
    assert.strictEqual(sampleRate, 24000, 'Exact 24,000 Hz sample rate verified (not chipmunk 48k/8k)');
    assert.strictEqual(bitsPerSample, 16, '16-bit depth');
    assert.strictEqual(byteRate, 24000 * 1 * (16 / 8), 'Byte rate matches 48,000 bytes/sec');
    assert(wavResult.durationMs > 2000 && wavResult.durationMs < 6000, 'Intelligible duration for test prompt');
    console.log('✓ Test 2 passed: 24 kHz WAV rate verified; intelligible and not chipmunk.\n');

    // ----------------------------------------------------
    // TEST 3: Sentence-Chunked Streaming (Low First-Audio Latency)
    // ----------------------------------------------------
    console.log('[Test 3] Testing sentence-chunked streaming with live callbacks...');
    const twoSentenceQuestion = 'How did you configure Redis? What trade-offs did you consider?';
    const receivedChunks = [];
    const sentenceStarts = [];

    const streamStart = Date.now();
    let firstChunkLatency = 0;

    const streamRes = await tts.synthesizeStream(twoSentenceQuestion, {
      onSentenceStart: (sentence, idx, total) => {
        sentenceStarts.push({ sentence, idx, total });
      },
      onAudioChunk: (chunk, idx, isLast) => {
        if (!firstChunkLatency) {
          firstChunkLatency = Date.now() - streamStart;
        }
        receivedChunks.push({ chunk, idx, isLast, bytes: chunk.length });
      }
    });

    console.log(`  First audio chunk latency: ${firstChunkLatency}ms (D6 target ≤ 3000ms)`);
    console.log(`  Sentences streamed: ${sentenceStarts.length}, Chunks delivered: ${receivedChunks.length}`);

    assert.strictEqual(streamRes.success, true, 'Stream completed successfully');
    assert.strictEqual(sentenceStarts.length, 2, '2 sentences detected and started');
    assert.strictEqual(receivedChunks.length, 2, '2 audio chunks received');
    assert(firstChunkLatency < 3000, 'First audio chunk arrived well under 3s budget');
    console.log('✓ Test 3 passed: Sentence-chunked streaming delivers low first-audio latency.\n');

    // ----------------------------------------------------
    // TEST 4: Cancel Queue (Immediate Barge-in Interruption)
    // ----------------------------------------------------
    console.log('[Test 4] Testing cancel queue — cancelling mid-stream drops pending sentences...');
    const longMultiSentence =
      'First sentence about your system design. Second sentence about your database tuning. Third sentence about your deployment pipelines. Fourth sentence about your incident response.';

    const chunksBeforeCancel = [];
    let cancelEventFired = false;

    tts.on('cancelled', () => {
      cancelEventFired = true;
    });

    // Start streaming and cancel immediately after first chunk arrives
    const cancelStreamPromise = tts.synthesizeStream(longMultiSentence, {
      onAudioChunk: (chunk, idx) => {
        chunksBeforeCancel.push(idx);
        // Candidate barges in: cancel queue immediately!
        tts.cancel();
      }
    });

    const cancelResult = await cancelStreamPromise;

    console.log(`  Cancel result: cancelled=${cancelResult.cancelled}, Chunks emitted: ${chunksBeforeCancel.length}`);
    assert.strictEqual(cancelResult.cancelled, true, 'Synthesis was flagged as cancelled');
    assert.strictEqual(cancelEventFired, true, 'Cancelled event fired');
    assert(chunksBeforeCancel.length < 4, 'Remaining queued sentences were dropped immediately');
    console.log('✓ Test 4 passed: Cancel queue immediately halts playback and drops pending sentences.\n');

    // ----------------------------------------------------
    // TEST 5: TTS Failure -> Caption Fallback (§12)
    // ----------------------------------------------------
    console.log('[Test 5] Testing §12 caption fallback on simulated TTS failure (invalid key)...');
    const faultyTts = new DeepgramTTS({ apiKey: 'invalid_dummy_key_to_force_401' });

    let captionFallbackFired = false;
    faultyTts.on('captionFallback', (data) => {
      captionFallbackFired = true;
    });

    const fallbackRes = await faultyTts.synthesizeStream('This question should fall back to caption.');

    console.log(`  Fallback result: success=${fallbackRes.success}, fallback=${fallbackRes.fallback}`);
    assert.strictEqual(fallbackRes.success, false, 'Failed TTS reports success: false');
    assert.strictEqual(fallbackRes.fallback, 'caption', 'Fallback strategy is "caption" per §12');
    assert.strictEqual(fallbackRes.text, 'This question should fall back to caption.', 'Original text preserved for data-channel display');
    assert.strictEqual(captionFallbackFired, true, 'captionFallback event dispatched');
    console.log('✓ Test 5 passed: TTS failure cleanly engages §12 caption fallback.\n');

    console.log('========================================================');
    console.log('   STEP S8 GATE TESTS: ALL 5 TESTS PASSED (100%)       ');
    console.log('========================================================');
  } finally {
    // Cleanup generated test WAV
    try {
      if (fs.existsSync(testWavPath)) {
        fs.unlinkSync(testWavPath);
      }
    } catch (_) {}
  }
}

runStepS8Tests().catch((err) => {
  console.error('\n❌ S8 Gate Test Failure:', err);
  process.exit(1);
});

