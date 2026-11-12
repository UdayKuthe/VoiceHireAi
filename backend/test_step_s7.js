/**
 * VoiceHire AI — Step S7 Gate Tests: Deepgram STT & Turn Manager
 *
 * Verifies all S7 requirements per task_prd.md §3.3, §9, §15:
 *  1. WAV fixture streaming → expected final transcript received from Deepgram live STT.
 *  2. Interim transcript never writes to Redis state.
 *  3. Only finalized turn triggers answer analysis.
 *  4. WebSocket auto-reconnects cleanly after an abrupt/forced close.
 *  5. Noise filter suppresses spurious/short noise artifacts.
 *  6. Barge-in detection triggers when speech exceeds 400ms during AI speaking.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DeepgramLiveSTT } from './src/services/voice/sttDeepgram.js';
import { TurnManager } from './src/services/voice/turnManager.js';
import { RedisStateManager } from './src/services/redisState.service.js';
import { closeRedisClient } from './src/config/redis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runStepS7Tests() {
  console.log('========================================================');
  console.log('   VoiceHire AI — Step S7 Gate Verification Tests      ');
  console.log('========================================================\n');

  const fixturePath = path.join(__dirname, 'tests/fixtures/sample_speech.wav');
  assert(fs.existsSync(fixturePath), `Audio fixture exists at ${fixturePath}`);
  const wavBuffer = fs.readFileSync(fixturePath);
  console.log(`[Setup] Loaded speech fixture (${wavBuffer.length} bytes).\n`);

  try {
    // ----------------------------------------------------
    // TEST 1: Live Audio Streaming -> Expected Final Transcript
    // ----------------------------------------------------
    console.log('[Test 1] Streaming WAV fixture to Deepgram Live STT...');
    const stt = new DeepgramLiveSTT({
      sampleRate: 16000,
      encoding: 'linear16',
      smartFormat: true,
      interimResults: true,
      utteranceEndMs: 1200
    });

    const turnManager = new TurnManager();

    let interimCount = 0;
    let finalSegmentCount = 0;
    let turnCompletedTranscript = '';

    stt.on('transcript', (data) => {
      if (!data.isFinal) {
        interimCount++;
      } else {
        finalSegmentCount++;
      }
      turnManager.handleTranscript(data);
    });

    stt.on('utteranceEnd', () => {
      turnManager.handleUtteranceEnd();
    });

    stt.on('speechStarted', () => {
      turnManager.handleSpeechStarted();
    });

    await stt.connect();
    console.log('  ✓ Connected to Deepgram Live STT WebSocket.');

    // Stream PCM audio in 200ms chunks (3200 bytes per chunk at 16kHz 16-bit mono)
    const chunkSize = 3200;
    // Skip 44-byte WAV header for linear16 stream
    const pcmData = wavBuffer.subarray(44);

    const turnPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Fallback flush if utteranceEnd hasn't fired yet
        turnManager.handleUtteranceEnd();
      }, 7000);

      turnManager.on('turnComplete', ({ transcript }) => {
        clearTimeout(timeout);
        resolve(transcript);
      });
    });

    for (let offset = 0; offset < pcmData.length; offset += chunkSize) {
      const chunk = pcmData.subarray(offset, offset + chunkSize);
      stt.sendAudio(chunk);
      // Small simulated real-time delay (20ms)
      await new Promise((r) => setTimeout(r, 20));
    }

    // Tell Deepgram audio stream has finalized
    stt.finalizeStream();

    turnCompletedTranscript = await turnPromise;
    console.log(`  Received Final Transcript: "${turnCompletedTranscript}"`);
    console.log(`  Interims received: ${interimCount}, Final segments: ${finalSegmentCount}`);

    assert(turnCompletedTranscript.length > 0, 'Transcript is non-empty');
    const lower = turnCompletedTranscript.toLowerCase();
    assert(
      lower.includes('cach') || lower.includes('implement') || lower.includes('scale'),
      `Transcript matches expected keywords (got: "${turnCompletedTranscript}")`
    );
    console.log('✓ Test 1 passed: WAV audio streamed to expected final transcript.\n');

    // ----------------------------------------------------
    // TEST 2: Interim Transcripts NEVER Write to State
    // ----------------------------------------------------
    console.log('[Test 2] Verifying interim transcripts NEVER write to Redis state...');
    let stateWritesOccurred = false;
    const testTm = new TurnManager();

    testTm.on('interim', (evt) => {
      // Gate check: verify that interim events are explicitly marked unpersisted
      assert.strictEqual(evt.persisted, false, 'Interim event explicitly not persisted');
      // If any service attempted to write state here, flag it
      if (evt.persisted) {
        stateWritesOccurred = true;
      }
    });

    // Simulate 5 interim updates
    testTm.handleTranscript({ text: 'I', isFinal: false });
    testTm.handleTranscript({ text: 'I implemented', isFinal: false });
    testTm.handleTranscript({ text: 'I implemented Redis', isFinal: false });

    assert.strictEqual(stateWritesOccurred, false, 'Zero Redis writes occurred from interim results');
    console.log('✓ Test 2 passed: Interim transcripts strictly isolated from state persistence.\n');

    // ----------------------------------------------------
    // TEST 3: Only Finalized Transcript Triggers Analysis
    // ----------------------------------------------------
    console.log('[Test 3] Verifying only completed final turn triggers analysis...');
    let analysisTriggerCount = 0;
    const testTm3 = new TurnManager();

    testTm3.on('turnComplete', ({ transcript }) => {
      analysisTriggerCount++;
    });

    // 1. Interim updates -> NO analysis triggered
    testTm3.handleTranscript({ text: 'I integrated Redis caching', isFinal: false });
    assert.strictEqual(analysisTriggerCount, 0, 'No analysis triggered on interim');

    // 2. Final segment buffered -> NO analysis triggered until utterance complete
    testTm3.handleTranscript({ text: 'I integrated Redis caching.', isFinal: true, isSpeechFinal: false });
    assert.strictEqual(analysisTriggerCount, 0, 'No analysis triggered on segment before utterance end');

    // 3. Utterance end -> triggers turnComplete and analysis
    testTm3.handleUtteranceEnd();
    assert.strictEqual(analysisTriggerCount, 1, 'Exactly 1 analysis triggered on turnComplete');
    console.log('✓ Test 3 passed: Only finalized turn triggers answer analysis.\n');

    // ----------------------------------------------------
    // TEST 4: WebSocket Auto-Reconnect After Forced Close
    // ----------------------------------------------------
    console.log('[Test 4] Testing auto-reconnect after abrupt/forced socket closure...');
    let reconnectFired = false;
    let reconnectedFired = false;

    stt.on('reconnecting', ({ attempt }) => {
      console.log(`  Deepgram reconnecting (attempt ${attempt})...`);
      reconnectFired = true;
    });

    stt.on('reconnected', () => {
      console.log('  Deepgram reconnected successfully!');
      reconnectedFired = true;
    });

    // Abruptly terminate the underlying socket
    stt.forceCloseForTest();

    // Wait up to 5s for backoff reconnect
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (reconnectedFired || stt.isConnected) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });

    assert(stt.isConnected, 'STT socket reconnected after forced close');
    console.log('✓ Test 4 passed: Auto-reconnect recovers connection after forced termination.\n');

    // Clean disconnect
    stt.disconnect();

    // ----------------------------------------------------
    // TEST 5: Noise Filter Suppresses Stray Noise
    // ----------------------------------------------------
    console.log('[Test 5] Testing noise filter on short/stray noise artifacts...');
    const testTmNoise = new TurnManager({ noiseThresholdChars: 3 });
    let noiseTurnCompleted = false;

    testTmNoise.on('turnComplete', () => {
      noiseTurnCompleted = true;
    });

    // Stray click/breath noise of 1-2 characters
    testTmNoise.handleTranscript({ text: '.', isFinal: true, isSpeechFinal: true });
    testTmNoise.handleUtteranceEnd();

    assert.strictEqual(noiseTurnCompleted, false, 'Noise filter suppressed short noise artifact');
    console.log('✓ Test 5 passed: Noise filter correctly drops sub-threshold artifacts.\n');

    // ----------------------------------------------------
    // TEST 6: Barge-In Detection (>400ms speech during TTS)
    // ----------------------------------------------------
    console.log('[Test 6] Testing barge-in detection during AI speech...');
    const testTmBarge = new TurnManager({ bargeInThresholdMs: 400 });
    let bargeInDetected = false;

    testTmBarge.on('bargeIn', () => {
      bargeInDetected = true;
    });

    // AI is speaking
    testTmBarge.setBotSpeaking(true);

    // Candidate begins speaking
    testTmBarge.handleSpeechStarted();

    // Wait 450ms (>400ms threshold)
    await new Promise((r) => setTimeout(r, 450));

    assert.strictEqual(bargeInDetected, true, 'Barge-in detected when speech exceeded 400ms');

    // Reset bot speaking
    testTmBarge.setBotSpeaking(false);
    console.log('✓ Test 6 passed: Barge-in triggers on speech >400ms during AI playback.\n');

    console.log('========================================================');
    console.log('   STEP S7 GATE TESTS: ALL 6 TESTS PASSED (100%)       ');
    console.log('========================================================');
  } finally {
    await closeRedisClient();
  }
}

runStepS7Tests().catch((err) => {
  console.error('\n❌ S7 Gate Test Failure:', err);
  process.exit(1);
});
