/**
 * api.js
 *
 * Thin wrappers around each provider's chat completion API.
 *
 * Supported backends:
 *   ollama    → local proxy          /v1/chat/completions          (OpenAI-compatible)
 *   gemini    → Google               /v1beta/openai/...            (OpenAI-compatible)
 *   openai    → OpenAI               /v1/chat/completions          (native)
 *   anthropic → Anthropic            /v1/messages                  (different schema)
 *   deepseek  → DeepSeek Platform    /v1/chat/completions          (OpenAI-compatible)
 *   mistral   → Mistral AI           /v1/chat/completions          (OpenAI-compatible)
 *   groq      → Groq Cloud           /openai/v1/chat/completions   (OpenAI-compatible)
 *
 * All functions return: { text, tokens, promptTokens }
 *   text         — completion text
 *   tokens       — completion (output) token count
 *   promptTokens — input token count (0 if not reported by the API)
 */

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────

/**
 * Rough token count when the API doesn't return usage stats.
 * 1 token ≈ 4 characters in English.
 */
function estimateTokens(text) {
  return Math.round(text.length / 4);
}

/**
 * Generic OpenAI-compatible POST.
 * Used by: Ollama, Gemini, OpenAI, DeepSeek, Mistral, Groq.
 */
async function callCompletions(url, body, headers = {}, signal) {
  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    // Surface the server error message to the UI
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data         = await response.json();
  const text         = data.choices?.[0]?.message?.content ?? '';
  const tokens       = data.usage?.completion_tokens ?? estimateTokens(text);
  const promptTokens = data.usage?.prompt_tokens     ?? 0;

  return { text, tokens, promptTokens };
}

// ─── OLLAMA ───────────────────────────────────────────────────────────────────

/**
 * Call a local Ollama model via the server.js proxy at /v1/*.
 * No CORS issues — the browser never contacts port 11434 directly.
 */
export async function callOllama(modelId, prompt, temperature, maxTokens, signal) {
  return callCompletions('/v1/chat/completions', {
    model:      modelId,
    messages:   [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
    stream:     false,
  }, {}, signal);
}

// ─── GEMINI ───────────────────────────────────────────────────────────────────

/**
 * Call a Gemini model via Google's OpenAI-compatible endpoint.
 * API key: https://aistudio.google.com/app/apikey
 */
export async function callGemini(modelId, prompt, temperature, maxTokens, apiKey, signal) {
  if (!apiKey) throw new Error('Google API key is required for Gemini. Enter it in the sidebar.');
  return callCompletions(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      model:      modelId,
      messages:   [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    },
    { Authorization: `Bearer ${apiKey}` },
    signal,
  );
}

// ─── OPENAI ───────────────────────────────────────────────────────────────────

/**
 * Call an OpenAI model via the official API.
 * API key: https://platform.openai.com/api-keys
 *
 * Uses the same OpenAI-compatible shape — no adapter needed.
 * Note: o1 models do not support the temperature parameter; it is omitted
 * automatically when modelId starts with "o1".
 */
export async function callOpenAI(modelId, prompt, temperature, maxTokens, apiKey, signal) {
  if (!apiKey) throw new Error('OpenAI API key is required for GPT models. Enter it in the sidebar.');
  const isO1 = modelId.startsWith('o1') || modelId.startsWith('o3');
  return callCompletions(
    'https://api.openai.com/v1/chat/completions',
    {
      model:      modelId,
      messages:   [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      // "o" models reject the temperature field entirely
      ...(!isO1 && { temperature }),
    },
    { Authorization: `Bearer ${apiKey}` },
    signal,
  );
}

// ─── ANTHROPIC ────────────────────────────────────────────────────────────────

/**
 * Call an Anthropic Claude model via the Messages API.
 * API key: https://console.anthropic.com/settings/keys
 *
 * The Anthropic API has a DIFFERENT schema from OpenAI:
 *   Request:  POST /v1/messages  { model, max_tokens, messages, temperature }
 *   Response: { content: [{ type: 'text', text: '...' }], usage: { output_tokens } }
 *
 * Because the browser cannot call api.anthropic.com directly (CORS), this
 * request is routed through server.js's /api/anthropic/messages proxy route.
 */
export async function callAnthropic(modelId, prompt, temperature, maxTokens, apiKey, signal) {
  if (!apiKey) throw new Error('Anthropic API key is required for Claude. Enter it in the sidebar.');

  const response = await fetch('/api/anthropic/messages', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,         // forwarded by server.js; never logged
      model:       modelId,
      max_tokens:  maxTokens,
      temperature,
      messages:    [{ role: 'user', content: prompt }],
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data         = await response.json();
  const text         = data.content?.[0]?.text ?? '';
  const tokens       = data.usage?.output_tokens ?? estimateTokens(text);
  const promptTokens = data.usage?.input_tokens  ?? 0;

  return { text, tokens, promptTokens };
}

// ─── DEEPSEEK ─────────────────────────────────────────────────────────────────
// Fully OpenAI-compatible — only the base URL and key differ.
// API key: https://platform.deepseek.com/api_keys

export async function callDeepSeek(modelId, prompt, temperature, maxTokens, apiKey, signal) {
  if (!apiKey) throw new Error('DeepSeek API key is required. Enter it in the sidebar.');
  return callCompletions(
    'https://api.deepseek.com/v1/chat/completions',
    { model: modelId, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens },
    { Authorization: `Bearer ${apiKey}` },
    signal,
  );
}

// ─── MISTRAL ──────────────────────────────────────────────────────────────────
// Fully OpenAI-compatible.
// API key: https://console.mistral.ai/api-keys

export async function callMistral(modelId, prompt, temperature, maxTokens, apiKey, signal) {
  if (!apiKey) throw new Error('Mistral API key is required. Enter it in the sidebar.');
  return callCompletions(
    'https://api.mistral.ai/v1/chat/completions',
    { model: modelId, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens },
    { Authorization: `Bearer ${apiKey}` },
    signal,
  );
}

// ─── GROQ ─────────────────────────────────────────────────────────────────────
// OpenAI-compatible, hosted on Groq's ultra-fast inference infrastructure.
// Expect sub-second latency on smaller models.
// API key: https://console.groq.com/keys

export async function callGroq(modelId, prompt, temperature, maxTokens, apiKey, signal) {
  if (!apiKey) throw new Error('Groq API key is required. Enter it in the sidebar.');
  return callCompletions(
    'https://api.groq.com/openai/v1/chat/completions',
    { model: modelId, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens },
    { Authorization: `Bearer ${apiKey}` },
    signal,
  );
}
