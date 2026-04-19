/**
 * main.js  —  Entry point
 *
 * Responsibilities:
 *   - Bootstrap the page (render model list, presets, set defaults)
 *   - Wire the Run button to eval.js
 *   - Handle tab switching
 *
 * Imports everything; nothing imports main.js.
 */

import { MODELS, PRESETS, DEFAULTS } from './config.js';
import { renderModelList, renderPresets } from './ui.js';
import { runEval } from './eval.js';

// ─── BOOT ────────────────────────────────────────────────────────────────────

/**
 * Selected model IDs — mutated by the toggle list in ui.js.
 * Declared here so runEval() can read the current state.
 */
let selectedModels;

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

  // Populate default values
  document.getElementById('tempInput').value    = DEFAULTS.temperature;
  document.getElementById('maxTokensInput').value = DEFAULTS.maxTokens;
  document.getElementById('ollamaUrl').value    = DEFAULTS.ollamaUrl;

  // Wire Run button
  document.getElementById('runBtn').addEventListener('click', () => {
    runEval(MODELS, selectedModels);
  });

  // Wire tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
});

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
