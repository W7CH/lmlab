/**
 * main.js  —  Entry point
 *
 * Boot sequence:
 *   1. Render static UI (presets, parameter defaults, tab wiring)
 *   2. Show model list skeleton while discovery is in flight
 *   3. Call Ollama health + model list in parallel with page render
 *   4. Merge discovered Ollama models with static Gemini models
 *   5. Assign chart colors and render the model toggle list
 *   6. Re-check + refresh model list whenever the ↺ button is clicked
 */

import { GEMINI_MODELS, CHART_COLORS, PRESETS, DEFAULTS } from './config.js';
import { renderModelList, renderPresets, setOllamaStatus, setModelListState } from './ui.js';
import { checkHealth, fetchOllamaModels } from './ollama.js';
import { runEval } from './eval.js';

// ─── LIVE STATE ───────────────────────────────────────────────────────────────

/**
 * The merged model list (Ollama + Gemini), populated after discovery.
 * Passed to runEval() on each run — always reflects the latest refresh.
 */
let allModels = [];

/**
 * The Set of selected model IDs — returned and mutated by renderModelList().
 */
let selectedModels = new Set();

// ─── BOOT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
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
  document.getElementById('ollamaCheckBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('spinning');
    await refreshModels();
    btn.classList.remove('spinning');
  });

  // Kick off discovery immediately
  refreshModels();
});

// ─── MODEL DISCOVERY + REFRESH ───────────────────────────────────────────────

/**
 * Full refresh cycle:
 *   1. Health-check Ollama and update the sidebar pill
 *   2. If running, fetch the model list; show skeleton while waiting
 *   3. Assign colors, merge with Gemini models, re-render the toggle list
 */
async function refreshModels() {
  setOllamaStatus('checking', 'Pinging localhost:11434…');
  setModelListState('loading');

  const health = await checkHealth();

  if (!health.running) {
    setOllamaStatus('stopped', 'Will auto-start on Run');
    // Still show Gemini models so the user can evaluate those while Ollama is off
    allModels    = buildModelList([], GEMINI_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
    return;
  }

  // Ollama is up — fetch detailed model list
  try {
    const ollamaModels = await fetchOllamaModels();
    const modelCount   = ollamaModels.length;

    setOllamaStatus(
      'running',
      modelCount > 0 ? `${modelCount} model(s) available` : 'No models pulled yet',
    );

    allModels      = buildModelList(ollamaModels, GEMINI_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
  } catch (err) {
    setOllamaStatus('error', err.message);
    setModelListState('error', 'Could not load model list');
    // Fall back to Gemini-only
    allModels      = buildModelList([], GEMINI_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
  }
}

// ─── MODEL LIST BUILDER ───────────────────────────────────────────────────────

/**
 * Merge Ollama + Gemini models and assign chart colors.
 *
 * Color assignment:
 *   - Colors are taken from CHART_COLORS in order (index mod length)
 *   - Ollama models come first, then Gemini — so the order is stable
 *     across refreshes as long as the installed models don't change
 *
 * @param {Array}  ollamaModels  - raw descriptors from fetchOllamaModels()
 * @param {Array}  geminiModels  - static entries from config.js
 * @returns {Array}              - unified model objects ready for the UI
 */
function buildModelList(ollamaModels, geminiModels) {
  const merged = [
    // Ollama models — none pre-selected, let user choose
    ...ollamaModels.map(m => ({
      id:      m.id,
      label:   m.label,
      backend: 'ollama',
      active:  false,
      meta: {
        family:        m.family,
        parameterSize: m.parameterSize,
        sizeGb:        m.sizeGb,
      },
    })),
    // Gemini models — none pre-selected either
    ...geminiModels.map(m => ({
      id:      m.id,
      label:   m.label,
      backend: 'gemini',
      active:  m.active ?? false,
    })),
  ];

  // Assign colors deterministically by position
  return merged.map((m, i) => ({
    ...m,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
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
