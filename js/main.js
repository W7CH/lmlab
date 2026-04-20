/**
 * main.js  —  Entry point
 *
 * Boot sequence:
 *   1. Render static UI (presets, parameter defaults, tab wiring)
 *   2. Show model list skeleton while discovery is in flight
 *   3. Health-check Ollama + fetch model list
 *   4. Merge Ollama models with Gemini / OpenAI / Anthropic static lists
 *   5. Assign chart colors and render the model toggle list
 *   6. Re-check + refresh model list when ↺ is clicked
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
      meta: { family: m.family, parameterSize: m.parameterSize, sizeGb: m.sizeGb },
    })),
    ...geminiModels.map(m => ({ ...m, active: m.active ?? false })),
    ...openaiModels.map(m => ({ ...m, active: m.active ?? false })),
    ...anthropicModels.map(m => ({ ...m, active: m.active ?? false })),
  ];

  return merged.map((m, i) => ({ ...m, color: CHART_COLORS[i % CHART_COLORS.length] }));
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
