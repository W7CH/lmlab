/**
 * config.js
 *
 * Static configuration only.
 * Ollama models are discovered automatically at runtime via `ollama list`.
 * Cloud models (Gemini, OpenAI, Anthropic) are declared here because they
 * cannot be discovered locally.
 */

// ─── GEMINI MODELS ────────────────────────────────────────────────────────────

export const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', backend: 'gemini', active: false },
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',      backend: 'gemini', active: false },
  { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash',      backend: 'gemini', active: false },
  { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro',        backend: 'gemini', active: false },
];

// ─── OPENAI MODELS ────────────────────────────────────────────────────────────

export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', backend: 'openai', active: false },
  { id: 'gpt-4o',      label: 'GPT-4o',      backend: 'openai', active: false },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', backend: 'openai', active: false },
  { id: 'o1-mini',     label: 'o1 Mini',     backend: 'openai', active: false },
];

// ─── ANTHROPIC MODELS ─────────────────────────────────────────────────────────

export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5',  backend: 'anthropic', active: false },
  { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6', backend: 'anthropic', active: false },
  { id: 'claude-opus-4-6',            label: 'Claude Opus 4.6',   backend: 'anthropic', active: false },
];

// ─── CHART COLOR PALETTE ──────────────────────────────────────────────────────
// Assigned in order: Ollama → Gemini → OpenAI → Anthropic.
// Wraps around if there are more models than colors.

export const CHART_COLORS = [
  '#a78bfa', // violet
  '#60a5fa', // blue
  '#34d399', // emerald
  '#fb923c', // orange
  '#f472b6', // pink
  '#facc15', // yellow
  '#38bdf8', // sky
  '#f87171', // red
  '#4ade80', // green
  '#c084fc', // purple
  '#fb7185', // rose
  '#67e8f9', // cyan
];

// ─── PROMPT PRESETS ───────────────────────────────────────────────────────────
// Key = short label shown on the preset button.
// Value = full prompt text injected into the textarea.

export const PRESETS = {
  Palindrome: `Write a Python function that checks if a string is a palindrome, handles edge cases (empty string, spaces, punctuation), and includes docstring + type hints + 3 unit tests using unittest.`,

  'Merge sort': `Implement merge sort in Python with type hints, a docstring explaining the algorithm complexity, and 3 test cases covering sorted, reverse-sorted, and mixed arrays.`,

  'REST API': `Write a minimal Python REST API using only the built-in http.server module that handles GET /items and POST /items with JSON body, storing items in memory.`,

  'Email regex': `Write a Python function that uses regex to extract all email addresses from a text string. Include type hints, docstring, and tests for edge cases like malformed emails.`,

  Fibonacci: `Implement three different approaches to Fibonacci in Python (recursive, iterative, memoized), with time complexity comments, type hints, and a benchmark comparing them.`,

  'Binary search': `Implement binary search in Python for both sorted lists and a BST. Include type hints, edge-case handling (empty list, value not present), and 4 unit tests.`,
};

// ─── DEFAULT API PARAMETERS ───────────────────────────────────────────────────

export const DEFAULTS = {
  temperature: 0.7,
  maxTokens:   1024,
};
