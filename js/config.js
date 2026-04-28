/**
 * config.js
 *
 * Static configuration only.
 * Ollama models are discovered automatically at runtime via `ollama list`.
 * Cloud models (Gemini, OpenAI, Anthropic) are declared here because they
 * cannot be discovered locally.
 * Backends: ollama · gemini · openai · anthropic · deepseek · mistral · groq
 */

// ─── GEMINI MODELS ────────────────────────────────────────────────────────────

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', backend: 'gemini', active: false },
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash',      backend: 'gemini', active: false },
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro',        backend: 'gemini', active: false },
];

// ─── OPENAI MODELS ────────────────────────────────────────────────────────────

export const OPENAI_MODELS = [
  { id: 'gpt-5.5',      label: 'GPT-5.5',         backend: 'openai', active: false },
  { id: 'gpt-5.4',      label: 'GPT-5.4',         backend: 'openai', active: false },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini',    backend: 'openai', active: false },
  { id: 'gpt-4o',       label: 'GPT-4o (Legacy)', backend: 'openai', active: false },
];

// ─── ANTHROPIC MODELS ─────────────────────────────────────────────────────────

export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  backend: 'anthropic', active: false },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', backend: 'anthropic', active: false },
  { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6',   backend: 'anthropic', active: false },
];

// ─── DEEPSEEK MODELS ──────────────────────────────────────────────────────────

export const DEEPSEEK_MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', backend: 'deepseek', active: false },
  { id: 'deepseek-v4-pro',   label: 'DeepSeek V4 Pro',   backend: 'deepseek', active: false },
];

// ─── MISTRAL MODELS ───────────────────────────────────────────────────────────

export const MISTRAL_MODELS = [
  { id: 'mistral-small-latest',   label: 'Mistral Small',               backend: 'mistral', active: false },
  { id: 'mistral-medium-latest',  label: 'Mistral Medium',              backend: 'mistral', active: false },
  { id: 'mistral-large-latest',   label: 'Mistral Large',               backend: 'mistral', active: false },
  { id: 'magistral-small-latest', label: 'Magistral Small (Reasoning)', backend: 'mistral', active: false },
];

// ─── GROQ MODELS ──────────────────────────────────────────────────────────────
// Note: Groq provides ultra-fast inference — expect very low latency values.

export const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',        backend: 'groq', active: false },
  { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant', backend: 'groq', active: false },
  { id: 'openai/gpt-oss-120b',     label: 'GPT-OSS 120B',         backend: 'groq', active: false },
  { id: 'openai/gpt-oss-20b',      label: 'GPT-OSS 20B',          backend: 'groq', active: false },
];

// ─── CHART COLOR PALETTE ──────────────────────────────────────────────────────
// 24 perceptually-spaced colors, grouped by backend hue family so models
// from the same provider cluster visually in the charts.
//
// Hue families:
//   Ollama    → violet / purple  (270–300°)
//   Gemini    → teal / cyan      (170–200°)
//   OpenAI    → green            (140–165°)
//   Anthropic → orange / amber   (25–45°)
//   DeepSeek  → blue / indigo    (210–240°)
//   Mistral   → coral / red      (0–15°)
//   Groq      → yellow / lime    (70–100°)
//
// Colors are WCAG AA-safe on dark backgrounds and readable on light.

export const CHART_COLORS = [
  // Violet-purple family (Ollama)
  '#a78bfa', '#c084fc', '#818cf8', '#7c3aed',

  // Teal-cyan family (Gemini)
  '#2dd4bf', '#22d3ee', '#06b6d4', '#0891b2',

  // Green family (OpenAI)
  '#34d399', '#4ade80', '#86efac', '#16a34a',

  // Orange-amber family (Anthropic)
  '#fb923c', '#fbbf24', '#f59e0b', '#d97706',

  // Blue-indigo family (DeepSeek)
  '#60a5fa', '#3b82f6', '#6366f1', '#4f46e5',

  // Coral-rose family (Mistral)
  '#f87171', '#fb7185', '#e11d48', '#f43f5e',

  // Yellow-lime family (Groq)
  '#a3e635', '#84cc16', '#bef264', '#65a30d',
];

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT =
  `You are an expert software engineer. Write clean, idiomatic code with type hints and clear docstrings. Keep explanations brief and to the point.`;

export const SYSTEM_PRESETS = {
  'Coding':   `You are an expert software engineer. Write clean, idiomatic code with type hints and clear docstrings. Keep explanations brief and to the point.`,
  'Neutral':  `You are a helpful, harmless, and honest assistant.`,
  'Concise':  `Be as concise as possible. No preamble, no sign-off. Answer directly.`,
};

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
