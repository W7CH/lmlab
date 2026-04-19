/**
 * config.js
 *
 * Central configuration for LMLab.
 * This is the ONLY file you need to edit to add/remove models or prompts.
 */

// ─── MODEL REGISTRY ───────────────────────────────────────────────────────────
// Each entry represents one model available for evaluation.
//
// Fields:
//   id       – exact model string passed to the API (must match `ollama list`)
//   label    – display name shown in the UI
//   backend  – "ollama" | "gemini"
//   color    – accent color used in the timing chart
//   active   – whether the model is selected by default

export const MODELS = [
  {
    id:      'llama3.2',
    label:   'Llama 3.2',
    backend: 'ollama',
    color:   '#a78bfa',
    active:  true,
  },
  {
    id:      'qwen2.5',
    label:   'Qwen 2.5',
    backend: 'ollama',
    color:   '#60a5fa',
    active:  false,
  },
  {
    id:      'gemma3',
    label:   'Gemma 3',
    backend: 'ollama',
    color:   '#f472b6',
    active:  true,
  },
  {
    id:      'phi3',
    label:   'Phi-3',
    backend: 'ollama',
    color:   '#34d399',
    active:  false,
  },
  {
    id:      'deepseek-r1',
    label:   'DeepSeek-R1',
    backend: 'ollama',
    color:   '#fb923c',
    active:  false,
  },
  {
    id:      'gemini-2.0-flash-lite',
    label:   'Gemini 2.0 Flash Lite',
    backend: 'gemini',
    color:   '#6c8bff',
    active:  true,
  },
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
  ollamaUrl:   'http://localhost:11434',
};
