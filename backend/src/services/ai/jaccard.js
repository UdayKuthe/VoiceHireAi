/**
 * Normalized Jaccard Similarity & Duplicate Question Detection
 *
 * Implements spec §10:
 *  - Tokenizes, normalizes, and filters common stopwords
 *  - Computes Jaccard index: |A ∩ B| / |A ∪ B|
 *  - Checks if generated question exceeds 0.8 similarity threshold vs history
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'were', 'will', 'with', 'you', 'your', 'can', 'could',
  'how', 'what', 'when', 'where', 'which', 'who', 'why', 'would', 'tell', 'me', 'about'
]);

/**
 * Tokenizes and normalizes text into a clean Set of word stems/tokens
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenizeText(text = '') {
  if (typeof text !== 'string') return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return new Set(tokens);
}

/**
 * Computes normalized Jaccard similarity coefficient between two strings (0.0 to 1.0)
 * @param {string} textA
 * @param {string} textB
 * @returns {number}
 */
export function calculateJaccardSimilarity(textA = '', textB = '') {
  const setA = tokenizeText(textA);
  const setB = tokenizeText(textB);

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount += 1;
    }
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  if (unionCount === 0) return 0.0;

  return intersectionCount / unionCount;
}

/**
 * Checks if candidate text has > threshold Jaccard similarity with any text in history
 * @param {string} questionText
 * @param {Array<string|Object>} history List of prior questions or strings
 * @param {number} threshold Default 0.8 per spec §10
 * @returns {{ isDuplicate: boolean, maxSimilarity: number, matchingText: string|null }}
 */
export function checkDuplicateQuestion(questionText = '', history = [], threshold = 0.8) {
  let maxSimilarity = 0.0;
  let matchingText = null;

  for (const item of history) {
    const historicalText = typeof item === 'string' ? item : item?.text || '';
    if (!historicalText) continue;

    const sim = calculateJaccardSimilarity(questionText, historicalText);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      matchingText = historicalText;
    }
    if (sim > threshold) {
      return { isDuplicate: true, maxSimilarity: sim, matchingText: historicalText };
    }
  }

  return { isDuplicate: maxSimilarity > threshold, maxSimilarity, matchingText };
}

export default {
  tokenizeText,
  calculateJaccardSimilarity,
  checkDuplicateQuestion
};

