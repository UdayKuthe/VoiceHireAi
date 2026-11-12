/**
 * LLM Provider Chains Configuration
 *
 * Implements Phase 3 PRD §4:
 *  - question_pregen: Groq ANALYSIS -> Groq FAST -> Gemini FALLBACK -> templates
 *  - answer_analysis: Groq ANALYSIS -> Groq FAST -> Gemini FALLBACK -> template + queue
 *  - probe_generator: Groq FAST -> Gemini FALLBACK -> template
 *  - report_summary: Groq ANALYSIS -> Gemini FALLBACK -> deterministic summary
 */

import { env } from './env.js';

export const CHAINS = {
  question_pregen: [
    { provider: 'groq', model: env.GROQ_MODEL_ANALYSIS || 'openai/gpt-oss-120b' },
    { provider: 'groq', model: env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b' },
    { provider: 'gemini', model: env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite' }
  ],
  answer_analysis: [
    { provider: 'groq', model: env.GROQ_MODEL_ANALYSIS || 'openai/gpt-oss-120b' },
    { provider: 'groq', model: env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b' },
    { provider: 'gemini', model: env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite' }
  ],
  probe_generator: [
    { provider: 'groq', model: env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b' },
    { provider: 'gemini', model: env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite' }
  ],
  report_summary: [
    { provider: 'groq', model: env.GROQ_MODEL_ANALYSIS || 'openai/gpt-oss-120b' },
    { provider: 'gemini', model: env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite' }
  ]
};

/**
 * Returns a cloned chain array for the specified task
 * @param {string} task
 * @returns {Array<{ provider: string, model: string }>}
 */
export function getChainForTask(task) {
  const chain = CHAINS[task];
  if (!chain) {
    throw new Error(`Unknown LLM task chain: "${task}". Available: ${Object.keys(CHAINS).join(', ')}`);
  }
  return chain.map((entry) => ({ ...entry }));
}

export default {
  CHAINS,
  getChainForTask
};

