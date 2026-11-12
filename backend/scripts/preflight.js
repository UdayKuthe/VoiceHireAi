#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import WebSocket from 'ws';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODEL_ANALYSIS = process.env.GROQ_MODEL_ANALYSIS || 'openai/gpt-oss-120b';
const GROQ_MODEL_FAST = process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b';
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT || 'low';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const DEEPGRAM_STT_MODEL = process.env.DEEPGRAM_STT_MODEL || 'nova-2';
const DEEPGRAM_TTS_MODEL = process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voicehire';

// Parse CLI flags: --only a,b,c
const args = process.argv.slice(2);
let selectedAPIs = null;
const onlyIdx = args.indexOf('--only');
if (onlyIdx !== -1 && args[onlyIdx + 1]) {
  selectedAPIs = args[onlyIdx + 1].split(',').map((s) => s.trim().toLowerCase());
}

const shouldRun = (apiName) => {
  if (!selectedAPIs) return true;
  return selectedAPIs.includes(apiName.toLowerCase());
};

const results = {};

// 0. GROQ PREFLIGHT (§2.2)
const checkGroq = async () => {
  if (!shouldRun('groq')) return;
  process.stdout.write('Checking Groq API (models + 120B/20B JSON calls)... ');

  if (!GROQ_API_KEY) {
    results.groq = { status: 'FAIL', reason: 'GROQ_API_KEY is missing' };
    console.log('FAIL (Missing key)');
    return;
  }

  try {
    // 1. GET /models
    const modelsRes = await fetch(`${GROQ_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` }
    });

    if (!modelsRes.ok) {
      throw new Error(`GET /models returned HTTP ${modelsRes.status}`);
    }

    const modelsData = await modelsRes.json();
    const availableIds = (modelsData.data || []).map((m) => m.id);

    const hasAnalysis = availableIds.includes(GROQ_MODEL_ANALYSIS);
    const hasFast = availableIds.includes(GROQ_MODEL_FAST);

    if (!hasAnalysis || !hasFast) {
      throw new Error(
        `Required models missing in Groq. Analysis (${GROQ_MODEL_ANALYSIS}): ${hasAnalysis}, Fast (${GROQ_MODEL_FAST}): ${hasFast}. Available: ${availableIds.slice(0, 6).join(', ')}`
      );
    }

    // 2. Test GROQ_MODEL_ANALYSIS
    const analysisReq = {
      model: GROQ_MODEL_ANALYSIS,
      messages: [{ role: 'user', content: 'Respond with valid JSON: {"status":"ok","model":"analysis"}' }],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      reasoning_effort: GROQ_REASONING_EFFORT
    };

    const res1 = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(analysisReq)
    });

    if (!res1.ok) {
      const errText = await res1.text();
      throw new Error(`Analysis call failed (${GROQ_MODEL_ANALYSIS}): ${errText.slice(0, 100)}`);
    }

    const rateHeaders1 = {};
    for (const [k, v] of res1.headers.entries()) {
      if (k.startsWith('x-ratelimit-')) rateHeaders1[k] = v;
    }

    // Print limits for user comparison
    console.log('\n  [Groq 120B Rate Limits]:', Object.entries(rateHeaders1).map(([k, v]) => `${k}=${v}`).join(', '));
    console.log('  (Compare with console.groq.com/settings/limits)');

    // Space calls by 15s per §2.2
    process.stdout.write('  Spacing 15s between Groq calls...');
    await new Promise((r) => setTimeout(r, 15000));
    console.log(' done.');

    // 3. Test GROQ_MODEL_FAST
    const fastReq = {
      model: GROQ_MODEL_FAST,
      messages: [{ role: 'user', content: 'Respond with valid JSON: {"status":"ok","model":"fast"}' }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      reasoning_effort: GROQ_REASONING_EFFORT
    };

    const res2 = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fastReq)
    });

    if (!res2.ok) {
      const errText = await res2.text();
      throw new Error(`Fast model call failed (${GROQ_MODEL_FAST}): ${errText.slice(0, 100)}`);
    }

    results.groq = { status: 'PASS', details: 'Both Groq gpt-oss models verified with JSON mode' };
    console.log('Groq API check: PASS ✓');
  } catch (err) {
    results.groq = { status: 'FAIL', reason: err.message };
    console.log(`FAIL: ${err.message}`);
  }
};

// 1. GEMINI PREFLIGHT (§2.2)
const checkGemini = async () => {
  if (!shouldRun('gemini')) return;
  process.stdout.write('Checking Gemini API (extraction model list-only + fallback JSON call)... ');

  if (!GEMINI_API_KEY) {
    results.gemini = { status: 'FAIL', reason: 'GOOGLE_GEMINI_API_KEY is missing' };
    console.log('FAIL (Missing key)');
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // 1. Extraction model: list-models validation ONLY. NO generate call (§2.2)
    let extractionModelFound = false;
    let fallbackModelFound = false;
    const modelPager = await ai.models.list();
    for await (const m of modelPager) {
      const shortName = m.name?.replace('models/', '') || '';
      if (shortName === GEMINI_MODEL || m.name === GEMINI_MODEL) {
        extractionModelFound = true;
      }
      if (shortName === GEMINI_FALLBACK_MODEL || m.name === GEMINI_FALLBACK_MODEL) {
        fallbackModelFound = true;
      }
    }

    if (!extractionModelFound) {
      throw new Error(`Extraction model "${GEMINI_MODEL}" not found in Gemini models list`);
    }
    if (!fallbackModelFound) {
      throw new Error(`Fallback model "${GEMINI_FALLBACK_MODEL}" not found in Gemini models list`);
    }

    // 2. Fallback model: one tiny JSON-mode call (§2.2)
    const res = await ai.models.generateContent({
      model: GEMINI_FALLBACK_MODEL,
      contents: 'Respond with valid JSON containing {"status":"ok","timestamp":123456}',
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = res.text?.trim() || '';
    const parsed = JSON.parse(text);
    if (parsed.status !== 'ok') {
      throw new Error(`Unexpected JSON response structure: ${text}`);
    }

    results.gemini = {
      status: 'PASS',
      details: `Extraction model ${GEMINI_MODEL} verified via list-models; Fallback ${GEMINI_FALLBACK_MODEL} verified via JSON generate call`
    };
    console.log('PASS ✓');
  } catch (err) {
    results.gemini = { status: 'FAIL', reason: err.message };
    console.log(`FAIL: ${err.message}`);
  }
};

// 2. DEEPGRAM STT PREFLIGHT
const checkDeepgramSTT = async () => {
  if (!shouldRun('deepgram-stt')) return;
  process.stdout.write('Checking Deepgram STT (Streaming WS)... ');

  if (!DEEPGRAM_API_KEY) {
    results['deepgram-stt'] = { status: 'FAIL', reason: 'DEEPGRAM_API_KEY is missing' };
    console.log('FAIL (Missing key)');
    return;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const wsUrl = `wss://api.deepgram.com/v1/listen?model=${DEEPGRAM_STT_MODEL}&encoding=linear16&sample_rate=16000`;
    const ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { ws.terminate(); } catch (_) {}
        results['deepgram-stt'] = { status: 'FAIL', reason: 'Deepgram STT connection timed out after 6s' };
        console.log('FAIL (Timeout)');
        resolve();
      }
    }, 6000);

    ws.on('open', () => {
      // Send 1 second of linear16 silence (16000 samples * 2 bytes = 32000 zero bytes)
      const silence = Buffer.alloc(32000);
      ws.send(silence);
      // Close stream cleanly
      try {
        ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch (_) {}
    });

    ws.on('message', (data) => {
      // Received response from Deepgram
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        try { ws.close(); } catch (_) {}
        results['deepgram-stt'] = { status: 'PASS', details: `Deepgram STT WS model ${DEEPGRAM_STT_MODEL} connected & responded` };
        console.log('PASS ✓');
        resolve();
      }
    });

    ws.on('close', (code, reason) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (code === 1000) {
          results['deepgram-stt'] = { status: 'PASS', details: 'Stream opened and closed cleanly (1000)' };
          console.log('PASS ✓');
        } else {
          results['deepgram-stt'] = { status: 'FAIL', reason: `WS closed unexpectedly: ${code} ${reason}` };
          console.log(`FAIL (${code} ${reason})`);
        }
        resolve();
      }
    });

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        results['deepgram-stt'] = { status: 'FAIL', reason: err.message };
        console.log(`FAIL: ${err.message}`);
        resolve();
      }
    });
  });
};

// 3. DEEPGRAM TTS PREFLIGHT
const checkDeepgramTTS = async () => {
  if (!shouldRun('deepgram-tts')) return;
  process.stdout.write('Checking Deepgram TTS (REST / Streaming synthesize)... ');

  if (!DEEPGRAM_API_KEY) {
    results['deepgram-tts'] = { status: 'FAIL', reason: 'DEEPGRAM_API_KEY is missing' };
    console.log('FAIL (Missing key)');
    return;
  }

  try {
    const url = `https://api.deepgram.com/v1/speak?model=${DEEPGRAM_TTS_MODEL}&encoding=linear16&sample_rate=24000`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: 'test' })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) {
      throw new Error('TTS returned 0 bytes of audio');
    }

    results['deepgram-tts'] = { status: 'PASS', details: `Synthesized ${buf.byteLength} bytes at 24kHz linear16` };
    console.log(`PASS ✓ (${buf.byteLength} bytes)`);
  } catch (err) {
    results['deepgram-tts'] = { status: 'FAIL', reason: err.message };
    console.log(`FAIL: ${err.message}`);
  }
};

// 4. LIVEKIT PREFLIGHT
const checkLiveKit = async () => {
  if (!shouldRun('livekit')) return;
  process.stdout.write('Checking LiveKit (Token + RoomService listRooms)... ');

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    results.livekit = { status: 'FAIL', reason: 'LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET missing' };
    console.log('FAIL (Missing credentials)');
    return;
  }

  try {
    // Test Token creation
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: 'preflight-check-user',
      name: 'Preflight Tester'
    });
    at.addGrant({ roomJoin: true, room: 'preflight-room' });
    const token = await at.toJwt();
    if (!token) throw new Error('Failed to generate LiveKit AccessToken JWT');

    // Convert wss:// to https:// or ws:// to http:// for RoomServiceClient HTTP API
    const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
    const roomService = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const rooms = await roomService.listRooms();

    results.livekit = { status: 'PASS', details: `RoomService active, ${rooms.length} active room(s)` };
    console.log(`PASS ✓ (${rooms.length} active rooms)`);
  } catch (err) {
    results.livekit = { status: 'FAIL', reason: err.message };
    console.log(`FAIL: ${err.message}`);
  }
};

// 5. REDIS PREFLIGHT
const checkRedis = async () => {
  if (!shouldRun('redis')) return;
  process.stdout.write('Checking Redis (PING + SET/GET/DEL)... ');

  if (!REDIS_URL) {
    results.redis = { status: 'FAIL', reason: 'REDIS_URL is missing' };
    console.log('FAIL (Missing URL)');
    return;
  }

  let redis;
  try {
    redis = new Redis(REDIS_URL, {
      connectTimeout: 4000,
      maxRetriesPerRequest: 1,
      lazyConnect: true
    });
    await redis.connect();

    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error(`Unexpected Redis PING response: ${pong}`);

    const testKey = 'voicehire:preflight:test';
    await redis.set(testKey, 'ok', 'EX', 10);
    const val = await redis.get(testKey);
    if (val !== 'ok') throw new Error(`Redis GET returned "${val}", expected "ok"`);
    await redis.del(testKey);

    await redis.quit();
    results.redis = { status: 'PASS', details: 'PING, SET, GET, DEL with TTL verified' };
    console.log('PASS ✓');
  } catch (err) {
    if (redis) {
      try { redis.disconnect(); } catch (_) {}
    }
    results.redis = { status: 'FAIL', reason: err.message };
    console.log(`FAIL: ${err.message}`);
  }
};

// 6. MONGODB PREFLIGHT
const checkMongoDB = async () => {
  if (!shouldRun('mongodb')) return;
  process.stdout.write('Checking MongoDB (connect + admin ping)... ');

  if (!MONGODB_URI) {
    results.mongodb = { status: 'FAIL', reason: 'MONGODB_URI is missing' };
    console.log('FAIL (Missing URI)');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000
    });
    await mongoose.connection.db.admin().ping();
    await mongoose.disconnect();

    results.mongodb = { status: 'PASS', details: 'Connection and admin ping succeeded' };
    console.log('PASS ✓');
  } catch (err) {
    results.mongodb = { status: 'FAIL', reason: err.message };
    console.log(`FAIL: ${err.message}`);
  }
};

// MAIN RUNNER
const main = async () => {
  console.log('========================================================');
  console.log('   VoiceHire AI — External API & Services Preflight     ');
  console.log('========================================================\n');

  await checkGroq();
  await checkGemini();
  await checkDeepgramSTT();
  await checkDeepgramTTS();
  await checkLiveKit();
  await checkRedis();
  await checkMongoDB();

  console.log('\n--------------------------------------------------------');
  console.log('PREFLIGHT SUMMARY:');
  let hasFailure = false;
  for (const [api, res] of Object.entries(results)) {
    const symbol = res.status === 'PASS' ? '✓' : '✗';
    console.log(`  [${symbol}] ${api.padEnd(14)} : ${res.status} ${res.reason ? `(${res.reason})` : ''}`);
    if (res.status !== 'PASS') hasFailure = true;
  }
  console.log('--------------------------------------------------------\n');

  if (hasFailure) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

main().catch((err) => {
  console.error('Preflight unexpected runner crash:', err);
  process.exit(1);
});
