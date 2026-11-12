/**
 * LLM Client Adapter with Multi-Provider Chain, Token Guards & Deterministic Fallback
 *
 * Implements Phase 3 PRD §4, §4.3, §4.4, §4.5, §11, §12:
 *  - Primary: Groq gpt-oss models (openai/gpt-oss-120b, openai/gpt-oss-20b)
 *  - Fallback: Google Gemini fallback (gemini-3.5-flash-lite)
 *  - Extraction model is NEVER called here
 *  - Reasoning model handling (reasoning_effort: "low", finish_reason retry)
 *  - Cooldown on 429 / 401 / 403
 *  - Rolling 60s TPM guard (~7K threshold) and 200K TPD daily counter guard
 *  - Deterministic fallback when chain is exhausted
 */

import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { getChainForTask } from '../../config/llmChains.js';

// ==============================================================================
// State & Tracking
// ==============================================================================

// Cooldown map: key = `${provider}:${model}` -> timestamp ms until cooled
const cooldowns = new Map();
const permanentSkips = new Set(); // 401/403 keys

// In-process token counters
// Rolling 60s windows: key = `${provider}:${model}` -> array of { ts, tokens }
const rollingWindows = new Map();

// Daily counters: key = `${provider}:${model}:${yyyymmdd}` -> totalTokens
const dailyUsage = new Map();

// Call statistics for getLlmStats()
const llmStats = {
  totalCalls: 0,
  callsByTask: {},
  callsByModel: {},
  tokensByModel: {},
  errors: []
};

// Test hook for mocking transport without burning quota
let mockTransport = null;

export function setMockTransport(fn) {
  mockTransport = fn;
}

export function resetLlmStats() {
  llmStats.totalCalls = 0;
  llmStats.callsByTask = {};
  llmStats.callsByModel = {};
  llmStats.tokensByModel = {};
  llmStats.errors = [];
  cooldowns.clear();
  permanentSkips.clear();
  rollingWindows.clear();
  dailyUsage.clear();
}

export function getLlmStats() {
  return JSON.parse(JSON.stringify(llmStats));
}

export function getCooldownState() {
  const now = Date.now();
  const active = {};
  for (const [k, exp] of cooldowns.entries()) {
    if (exp > now) {
      active[k] = Math.ceil((exp - now) / 1000);
    }
  }
  return { active, permanent: Array.from(permanentSkips) };
}

// ==============================================================================
// Token Guards & Helpers (§4.5)
// ==============================================================================

function getTodayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
}

export function estimateTokens(text = '', outputCap = 1000) {
  const inputEst = Math.ceil((text || '').length / 4);
  return inputEst + outputCap;
}

/**
 * Checks if a call would breach TPM (~7K limit on 8K bucket) or TPD (<10% remains on 200K bucket)
 */
export async function checkTokenGuards(provider, model, estimatedTokens) {
  if (provider !== 'groq') return { allowed: true };

  const key = `${provider}:${model}`;
  const now = Date.now();

  // 1. Daily TPD check (200K TPD limit; skip if <10% remains = >180K used)
  const todayKey = `${key}:${getTodayKey()}`;
  const usedToday = dailyUsage.get(todayKey) || 0;
  const maxTpd = 200000;
  if (usedToday + estimatedTokens > maxTpd * 0.9) {
    console.warn(`[TokenGuard] ${key} daily quota under 10% (${usedToday}/${maxTpd}). Skipping entry.`);
    return { allowed: false, reason: 'TPD_EXHAUSTED' };
  }

  // 2. Rolling 60s TPM check (8K TPM limit; threshold 7K)
  const windowLimit = 7000;
  let records = rollingWindows.get(key) || [];
  // Prune older than 60s
  records = records.filter((r) => now - r.ts < 60000);
  rollingWindows.set(key, records);

  const currentTpm = records.reduce((sum, r) => sum + r.tokens, 0);

  if (currentTpm + estimatedTokens > windowLimit) {
    console.warn(`[TokenGuard] ${key} current TPM (${currentTpm} + ${estimatedTokens} > ${windowLimit}). Waiting 5s...`);
    // Wait up to 5s
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Recheck after wait
    const nowAfter = Date.now();
    const freshRecords = (rollingWindows.get(key) || []).filter((r) => nowAfter - r.ts < 60000);
    rollingWindows.set(key, freshRecords);
    const recheckTpm = freshRecords.reduce((sum, r) => sum + r.tokens, 0);

    if (recheckTpm + estimatedTokens > windowLimit) {
      console.warn(`[TokenGuard] ${key} still over TPM threshold (${recheckTpm} > ${windowLimit}). Falling back to next entry.`);
      return { allowed: false, reason: 'TPM_EXCEEDED' };
    }
  }

  return { allowed: true };
}

export function recordTokenUsage(provider, model, tokens) {
  const key = `${provider}:${model}`;
  const now = Date.now();

  // Rolling
  const records = rollingWindows.get(key) || [];
  records.push({ ts: now, tokens });
  rollingWindows.set(key, records);

  // Daily
  const todayKey = `${key}:${getTodayKey()}`;
  const current = dailyUsage.get(todayKey) || 0;
  dailyUsage.set(todayKey, current + tokens);

  // Stats
  llmStats.tokensByModel[key] = (llmStats.tokensByModel[key] || 0) + tokens;
}

export function setDailyUsageForTest(provider, model, tokens) {
  const key = `${provider}:${model}`;
  const todayKey = `${key}:${getTodayKey()}`;
  dailyUsage.set(todayKey, tokens);
}

export function setRollingTpmForTest(provider, model, tokens) {
  const key = `${provider}:${model}`;
  rollingWindows.set(key, [{ ts: Date.now(), tokens }]);
}

// ==============================================================================
// Provider Callers
// ==============================================================================

function withTimeout(promise, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`LLM call timed out after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      reject(err);
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Groq caller using OpenAI-compatible chat completions endpoint
 */
async function callGroq({ model, prompt, systemInstruction, temperature = 0, maxTokens = 1200, timeoutMs = 8000 }) {
  const apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
  const baseUrl = env.GROQ_BASE_URL || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

  if (!apiKey) {
    const err = new Error('GROQ_API_KEY is not configured');
    err.status = 401;
    throw err;
  }

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    response_format: { type: 'json_object' },
    temperature,
    max_tokens: maxTokens,
    reasoning_effort: env.GROQ_REASONING_EFFORT || 'low'
  };

  const reqPromise = fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const res = await withTimeout(reqPromise, timeoutMs);

  if (!res.ok) {
    const errText = await res.text();
    let errJson = null;
    try {
      errJson = JSON.parse(errText);
    } catch {
      // ignore
    }

    const err = new Error(errJson?.error?.message || `Groq HTTP ${res.status}: ${errText.slice(0, 150)}`);
    err.status = res.status;
    err.headers = res.headers;
    throw err;
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const finishReason = choice?.finish_reason;
  const content = choice?.message?.content || '';

  const totalTokens = data.usage?.total_tokens || estimateTokens(prompt, maxTokens);

  return {
    rawText: content,
    finishReason,
    tokens: totalTokens,
    provider: 'groq',
    model
  };
}

let geminiClient = null;

function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      const err = new Error('GOOGLE_GEMINI_API_KEY is not configured');
      err.status = 500;
      throw err;
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

/**
 * Gemini fallback caller using Google GenAI SDK (only with GEMINI_FALLBACK_MODEL)
 */
async function callGemini({ model, prompt, systemInstruction, temperature = 0, maxTokens = 1000, timeoutMs = 8000 }) {
  const client = getGeminiClient();

  const config = {
    responseMimeType: 'application/json',
    temperature,
    maxOutputTokens: maxTokens
  };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const generatePromise = client.models.generateContent({
    model,
    contents: prompt,
    config
  });

  const response = await withTimeout(generatePromise, timeoutMs);
  const text = response?.text || '';
  const totalTokens = estimateTokens(prompt, maxTokens);

  return {
    rawText: text,
    finishReason: 'stop',
    tokens: totalTokens,
    provider: 'gemini',
    model
  };
}

// ==========================================
// Chain Executor (§4.4)
// ==========================================

export async function executeChain({
  task = 'answer_analysis',
  prompt,
  systemInstruction = '',
  schema = null,
  fallbackFn = null,
  temperature = 0,
  maxTokens = null,
  timeoutMs = null
}) {
  const configuredTimeout = timeoutMs || env.LLM_TIMEOUT_MS || 8000;
  const chain = getChainForTask(task);

  // Ensure prompt has "JSON" per Groq requirement
  let effectivePrompt = prompt;
  if (!effectivePrompt.includes('JSON') && !effectivePrompt.includes('json')) {
    effectivePrompt = `${effectivePrompt}\n\nRespond with a valid JSON object.`;
  }

  let defaultMaxTokens = 1200;
  if (task === 'probe_generator') defaultMaxTokens = 600;
  const effectiveMaxTokens = maxTokens || defaultMaxTokens;

  const now = Date.now();
  let lastError = null;

  for (let depth = 0; depth < chain.length; depth++) {
    const entry = chain[depth];
    const key = `${entry.provider}:${entry.model}`;

    // 1. Check permanent skip (401/403)
    if (permanentSkips.has(key)) {
      continue;
    }

    // 2. Check cooldown (429)
    const coolUntil = cooldowns.get(key) || 0;
    if (coolUntil > now) {
      console.warn(`[llmClient] Entry ${key} is cooled down for ${Math.ceil((coolUntil - now) / 1000)}s more. Skipping.`);
      continue;
    }

    // 3. Check Token Guards (TPM/TPD)
    const est = estimateTokens(effectivePrompt, effectiveMaxTokens);
    const guardCheck = await checkTokenGuards(entry.provider, entry.model, est);
    if (!guardCheck.allowed) {
      continue;
    }

    // 4. Call Attempt (Retry 1x on same entry for transient errors or finish_reason=length)
    let currentCap = effectiveMaxTokens;
    const maxRetriesForEntry = 1;

    for (let attempt = 0; attempt <= maxRetriesForEntry; attempt++) {
      const startTime = Date.now();
      try {
        let result;

        if (mockTransport) {
          result = await mockTransport({
            task,
            provider: entry.provider,
            model: entry.model,
            prompt: effectivePrompt,
            attempt,
            depth
          });
        } else if (entry.provider === 'groq') {
          result = await callGroq({
            model: entry.model,
            prompt: effectivePrompt,
            systemInstruction,
            temperature,
            maxTokens: currentCap,
            timeoutMs: configuredTimeout
          });
        } else {
          result = await callGemini({
            model: entry.model,
            prompt: effectivePrompt,
            systemInstruction,
            temperature,
            maxTokens: currentCap,
            timeoutMs: configuredTimeout
          });
        }

        const latency = Date.now() - startTime;

        // Check finish_reason === 'length' or empty content
        if (result.finishReason === 'length' || !result.rawText?.trim()) {
          if (attempt === 0) {
            console.warn(`[llmClient] ${key} hit finish_reason='length'. Doubling cap to ${currentCap * 2} and retrying 1x.`);
            currentCap = currentCap * 2;
            continue;
          } else {
            throw new Error(`Output truncated after length retry on ${key}`);
          }
        }

        // Validate JSON
        let parsed;
        try {
          parsed = JSON.parse(result.rawText.trim());
        } catch (parseErr) {
          throw new Error(`Invalid JSON returned by ${key}: ${parseErr.message}`);
        }

        const validated = schema ? schema.parse(parsed) : parsed;

        // Success! Record tokens and stats
        recordTokenUsage(entry.provider, entry.model, result.tokens || est);
        llmStats.totalCalls++;
        llmStats.callsByTask[task] = (llmStats.callsByTask[task] || 0) + 1;
        llmStats.callsByModel[key] = (llmStats.callsByModel[key] || 0) + 1;

        console.log(
          `[llmClient] Success | task:${task} provider:${entry.provider} model:${entry.model} latency:${latency}ms depth:${depth}`
        );

        return validated;
      } catch (err) {
        lastError = err;
        const latency = Date.now() - startTime;
        console.warn(
          `[llmClient] Failure | task:${task} provider:${entry.provider} model:${entry.model} attempt:${attempt + 1} latency:${latency}ms error:${err.message}`
        );

        // Classify error
        if (err.status === 401 || err.status === 403) {
          permanentSkips.add(key);
          console.error(`[llmClient] Unauthorized / Invalid key on ${key}. Permanently skipping.`);
          break; // move to next chain entry immediately
        }

        if (err.status === 429) {
          // Calculate cooldown
          let coolSeconds = env.LLM_COOLDOWN_SECONDS || 60;
          const retryAfter = err.headers?.get ? err.headers.get('retry-after') : null;
          if (retryAfter && !isNaN(Number(retryAfter))) {
            coolSeconds = Number(retryAfter);
          } else if (err.message?.toLowerCase().includes('day') || err.message?.toLowerCase().includes('rpd')) {
            coolSeconds = 3600; // 1 hour for daily quota exhaustion
          }
          cooldowns.set(key, Date.now() + coolSeconds * 1000);
          console.warn(`[llmClient] 429 on ${key}. Cooldown applied for ${coolSeconds}s.`);
          break; // move to next chain entry immediately
        }

        // If it's another error (5xx, timeout, JSON parse), retry 1x if attempt < maxRetriesForEntry
        if (attempt < maxRetriesForEntry) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  // All entries exhausted -> deterministic template fallback (§12)
  if (typeof fallbackFn === 'function') {
    console.warn(`[llmClient] Provider chain exhausted for task "${task}". Utilizing deterministic template fallback (§12).`);
    const fallbackData = fallbackFn({ error: lastError });
    return schema ? schema.parse(fallbackData) : fallbackData;
  }

  throw lastError || new Error(`LLM provider chain exhausted for task "${task}".`);
}

/**
 * Backward compatible entry point
 */
export async function generateJson(options) {
  const task = options.task || 'answer_analysis';
  return executeChain({ ...options, task });
}

export default {
  executeChain,
  generateJson,
  getLlmStats,
  resetLlmStats,
  setMockTransport,
  getCooldownState,
  checkTokenGuards,
  recordTokenUsage,
  estimateTokens,
  setDailyUsageForTest,
  setRollingTpmForTest
};
