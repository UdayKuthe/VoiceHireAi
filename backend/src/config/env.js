import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory or fallback to root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnvVars = [
  'DEEPGRAM_API_KEY',
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'GOOGLE_GEMINI_API_KEY',
  'GROQ_API_KEY',
  'REDIS_URL',
  'MONGODB_URI',
  'JWT_SECRET'
];

export const validateEnv = (strict = false) => {
  const missing = [];
  for (const key of requiredEnvVars) {
    const val = process.env[key];
    if (!val || typeof val !== 'string' || val.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const msg = `[BOOT FATAL] Missing required environment variable(s): ${missing.join(', ')}`;
    if (strict || process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    } else {
      console.warn(`⚠️  ${msg}`);
    }
  }
};

// Fail fast in non-test runtime if explicitly invoked
export const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voicehire',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'voicehire_default_dev_secret_key_12345',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_BASE_URL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
  GROQ_MODEL_ANALYSIS: process.env.GROQ_MODEL_ANALYSIS || 'openai/gpt-oss-120b',
  GROQ_MODEL_FAST: process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b',
  GROQ_REASONING_EFFORT: process.env.GROQ_REASONING_EFFORT || 'low',
  LLM_TIMEOUT_MS: parseInt(process.env.LLM_TIMEOUT_MS || '8000', 10),
  LLM_COOLDOWN_SECONDS: parseInt(process.env.LLM_COOLDOWN_SECONDS || '60', 10),
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || '',
  DEEPGRAM_STT_MODEL: process.env.DEEPGRAM_STT_MODEL || 'nova-2',
  DEEPGRAM_TTS_MODEL: process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en',
  LIVEKIT_URL: process.env.LIVEKIT_URL || '',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
  MOCK_VOICE: process.env.MOCK_VOICE === 'true',
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '10', 10)
};
