/**
 * main.js  —  Entry point
 *
 * Boot sequence:
 *   1. Initialise theme from localStorage (before first paint — no flash)
 *   2. Render static UI (presets, parameter defaults, tab wiring)
 *   3. Show model list skeleton while discovery is in flight
 *   4. Health-check Ollama + fetch model list
 *   5. Merge Ollama models with Gemini / OpenAI / Anthropic static lists
 *   6. Assign chart colors and render the model toggle list
 *   7. Re-check + refresh model list when ↺ is clicked
 */

import { GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS, CHART_COLORS, PRESETS, DEFAULTS } from './config.js';
import { renderModelList, renderPresets, setOllamaStatus, setModelListState } from './ui.js';
import { checkHealth, fetchOllamaModels } from './ollama.js';
import { runEval } from './eval.js';

// ─── LIVE STATE ───────────────────────────────────────────────────────────────

/** Full merged model list, refreshed on every ↺ click. */
let allModels = [];

/** Set of selected model IDs — mutated by renderModelList(). */
let selectedModels = new Set();

// ─── BOOT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Theme must be the very first thing — avoids a flash of the wrong theme
  initTheme();

  // Static sidebar controls
  renderPresets(
    PRESETS,
    document.getElementById('presetContainer'),
    document.getElementById('promptInput'),
  );

  // Populate defaults
  document.getElementById('tempInput').value      = DEFAULTS.temperature;
  document.getElementById('maxTokensInput').value = DEFAULTS.maxTokens;

  // Run button
  document.getElementById('runBtn').addEventListener('click', () => {
    runEval(allModels, selectedModels);
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Re-check / refresh button
  document.getElementById('ollamaCheckBtn')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.classList.add('spinning');
    await refreshModels();
    btn.classList.remove('spinning');
  });

  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);

  // Kick off discovery immediately
  refreshModels();
});

// ─── MODEL DISCOVERY + REFRESH ───────────────────────────────────────────────

async function refreshModels() {
  setOllamaStatus('checking', 'Pinging localhost:11434…');
  setModelListState('loading');

  const health = await checkHealth();

  if (!health.running) {
    setOllamaStatus('stopped', 'Will auto-start on Run');
    allModels      = buildModelList([], GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
    return;
  }

  try {
    const ollamaModels = await fetchOllamaModels();
    setOllamaStatus(
      'running',
      ollamaModels.length > 0
        ? `${ollamaModels.length} model(s) available`
        : 'No models pulled yet',
    );
    allModels      = buildModelList(ollamaModels, GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
  } catch (err) {
    setOllamaStatus('error', err.message);
    setModelListState('error', 'Could not load model list');
    allModels      = buildModelList([], GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
  }
}

// ─── MODEL LIST BUILDER ───────────────────────────────────────────────────────

/**
 * Merge all model sources and assign chart colors by position.
 * Order: Ollama (alphabetical) → Gemini → OpenAI → Anthropic
 */
function buildModelList(ollamaModels, geminiModels, openaiModels, anthropicModels) {
  const merged = [
    ...ollamaModels.map(m => ({
      id:      m.id,
      label:   m.label,
      backend: 'ollama',
      active:  false,
      meta:    { family: m.family, parameterSize: m.parameterSize, sizeGb: m.sizeGb },
    })),
    ...geminiModels.map(m   => ({ ...m, active: m.active   ?? false })),
    ...openaiModels.map(m   => ({ ...m, active: m.active   ?? false })),
    ...anthropicModels.map(m => ({ ...m, active: m.active  ?? false })),
  ];

  return merged.map((m, i) => ({ ...m, color: CHART_COLORS[i % CHART_COLORS.length] }));
}

// ─── THEME ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'llm-eval-theme';
const HLJS_DARK   = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
const HLJS_LIGHT  = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';

/**
 * Read the saved theme from localStorage (or fall back to OS preference),
 * then apply it. Call before any rendering to prevent a theme flash.
 */
function initTheme() {
  const saved  = localStorage.getItem(STORAGE_KEY);
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (osDark ? 'dark' : 'light'));
}

/** Flip between dark and light and persist the choice. */
function toggleTheme() {
  const current = document.documentElement.dataset.theme ?? 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/**
 * Apply a theme:
 *   1. Set data-theme on <html> — CSS variables update immediately
 *   2. Swap the highlight.js stylesheet href
 *   3. Re-highlight any code blocks already rendered
 *   4. Persist choice to localStorage
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  // Swap the highlight.js theme stylesheet
  const hljsLink = document.getElementById('hljs-theme');
  if (hljsLink) hljsLink.href = theme === 'dark' ? HLJS_DARK : HLJS_LIGHT;

  // Re-highlight any code blocks already in the DOM
  if (typeof hljs !== 'undefined') {
    document.querySelectorAll('pre code[class*="language-"]').forEach(block => {
      delete block.dataset.highlighted;
      hljs.highlightElement(block);
    });
  }

  localStorage.setItem(STORAGE_KEY, theme);
}

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────

const TAB_IDS = ['results', 'compare', 'chart'];

function switchTab(name) {
  TAB_IDS.forEach(t => {
    const panel = document.getElementById(`tab${capitalise(t)}`);
    if (panel) panel.classList.toggle('hidden', t !== name);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
