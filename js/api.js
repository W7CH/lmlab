/**
 * api.js
 *
 * Thin wrappers around the chat.completions API.
 *
 * Both backends use the same OpenAI-compatible request shape:
 *   POST { model, messages, temperature, max_tokens }
 *
 * The only differences are:
 *   - Base URL  (localhost for Ollama, Google's endpoint for Gemini)
 *   - Auth      (none for Ollama, Bearer token for Gemini)
 *
 * Return shape: { text: string, tokens: number }
 */

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Rough token estimate when the API doesn't return usage stats.
 * Rule of thumb: 1 token ≈ 4 characters in English.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.round(text.length / 4);
}

/**
 * Shared fetch logic for any OpenAI-compatible endpoint.
 * @param {string} url        - Full URL to POST to
 * @param {Object} body       - Request body (already includes model + messages)
 * @param {Object} [headers]  - Extra headers (e.g. Authorization)
 * @returns {Promise<{ text: string, tokens: number }>}
 */
async function callCompletions(url, body, headers = {}) {
  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    // Surface the server error message to the UI
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();

  const text   = data.choices?.[0]?.message?.content ?? '';
  const tokens = data.usage?.completion_tokens ?? estimateTokens(text);

  return { text, tokens };
}

// ─── OLLAMA ───────────────────────────────────────────────────────────────────

/**
 * Call a locally-running Ollama model via its OpenAI-compatible endpoint.
 *
 * Ollama must be running:  ollama serve
 * The model must be pulled: ollama pull <modelId>
 *
 * @param {string} modelId
 * @param {string} prompt
 * @param {number} temperature
 * @param {number} maxTokens
 * @param {string} baseUrl     - e.g. "http://localhost:11434"
 * @returns {Promise<{ text: string, tokens: number }>}
 */
export async function callOllama(modelId, prompt, temperature, maxTokens, baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const body = {
    model:      modelId,
    messages:   [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
    stream:     false,
  };

  return callCompletions(url, body);
}

// ─── GEMINI ───────────────────────────────────────────────────────────────────

/**
 * Call a Gemini model via Google's OpenAI-compatible endpoint.
 *
 * Requires a Google AI Studio API key:
 *   https://aistudio.google.com/app/apikey
 *
 * The endpoint mirrors the OpenAI spec, so the request body is identical.
 *
 * @param {string} modelId
 * @param {string} prompt
 * @param {number} temperature
 * @param {number} maxTokens
 * @param {string} apiKey
 * @returns {Promise<{ text: string, tokens: number }>}
 */
export async function callGemini(modelId, prompt, temperature, maxTokens, apiKey) {
  if (!apiKey) {
    throw new Error('Google API key is required for Gemini models. Enter it in the sidebar.');
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  const body = {
    model:      modelId,
    messages:   [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
  };

  return callCompletions(url, body, { Authorization: `Bearer ${apiKey}` });
}
