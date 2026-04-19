/**
 * main.js  —  Entry point
 *
 * Responsibilities:
 *   - Bootstrap the page (render model list, presets, set defaults)
 *   - Run an Ollama health check on page load and keep the sidebar indicator live
 *   - Wire the Run button to eval.js
 *   - Handle tab switching
 */

import { MODELS, PRESETS, DEFAULTS } from './config.js';
import { renderModelList, renderPresets, setOllamaStatus } from './ui.js';
import { checkHealth, pollUntilReady } from './ollama.js';
import { runEval } from './eval.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

/** Selected model IDs — mutated by the toggle list rendered in ui.js. */
let selectedModels;

// ─── BOOT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Render sidebar controls
  selectedModels = renderModelList(
    MODELS,
    document.getElementById('modelList'),
  );

  renderPresets(
    PRESETS,
    document.getElementById('presetContainer'),
    document.getElementById('promptInput'),
  );

  // Populate defaults
  document.getElementById('tempInput').value      = DEFAULTS.temperature;
  document.getElementById('maxTokensInput').value = DEFAULTS.maxTokens;

  // Wire Run button
  document.getElementById('runBtn').addEventListener('click', () => {
    runEval(MODELS, selectedModels);
  });

  // Wire tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Initial Ollama health check ──────────────────────────────────────────
  initOllamaStatus();

  // ── Re-check button ───────────────────────────────────────────────────────
  document.getElementById('ollamaCheckBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('spinning');
    await initOllamaStatus();
    btn.classList.remove('spinning');
  });
});

// ─── OLLAMA STATUS (page load) ────────────────────────────────────────────────

async function initOllamaStatus() {
  setOllamaStatus('checking', 'Pinging localhost:11434…');

  const health = await checkHealth();

  if (health.running) {
    const modelCount = health.models?.length ?? 0;
    setOllamaStatus(
      'running',
      modelCount > 0 ? `${modelCount} model(s) pulled` : 'No models pulled yet',
    );
  } else {
    setOllamaStatus('stopped', 'Will auto-start on Run');
  }
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
