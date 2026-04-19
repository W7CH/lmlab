/**
 * config.js
 *
 * Static configuration only.
 * Ollama models are now discovered automatically at runtime via `ollama list`.
 * The only models you need to declare here are cloud/remote ones (Gemini, etc.)
 * that cannot be discovered locally.
 */

// ─── GEMINI (and other remote) MODELS ────────────────────────────────────────
// These are merged with the auto-discovered Ollama models at page load.
// Add any Gemini model IDs you want to evaluate here.

export const GEMINI_MODELS = [
  {
    id:      'gemini-2.0-flash-lite',
    label:   'Gemini 2.0 Flash Lite',
    backend: 'gemini',
    active:  false,
  },
  {
    id:      'gemini-1.5-flash',
    label:   'Gemini 1.5 Flash',
    backend: 'gemini',
    active:  false,
  },
];

// ─── CHART COLOR PALETTE ──────────────────────────────────────────────────────
// Colors are assigned to models in order (Ollama first, then Gemini).
// If there are more models than colors, the palette wraps around.

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
