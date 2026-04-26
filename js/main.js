/**
 * main.js  —  Entry point
 *
 * Boot sequence:
 *   1. Initialise theme from localStorage (before first paint — no flash)
 *   2. Render prompt presets + parameter defaults
 *   3. Restore provider chip state from localStorage
 *   4. Restore model filter state from localStorage
 *   5. Wire all buttons (run, tabs, Ollama re-check, theme, chips, filter)
 *   6. Kick off Ollama health check + model discovery
 *   7. Merge Ollama models with static model lists
 *   8. Assign chart colors and render the model toggle list
 */

import { GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS, DEEPSEEK_MODELS, MISTRAL_MODELS, GROQ_MODELS, CHART_COLORS, PRESETS, DEFAULTS } from './config.js';
import { renderModelList, renderPresets, setOllamaStatus, setModelListState } from './ui.js';
import { checkHealth, fetchOllamaModels, requestStart } from './ollama.js';
import { runEval } from './eval.js';
import { initTheme, toggleTheme } from './theme.js';
import { initTabs } from './tabs.js';

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
const KEY_API_KEYS = 'llm-eval-api-keys-open';  // JSON array of expanded provider ids

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
  initTabs();

  // Ollama ↺ button:
  //   • If Ollama is already running  → refresh the model list (fast check)
  //   • If Ollama is not running      → attempt to start it, then refresh
  document.getElementById('ollamaCheckBtn')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.classList.add('spinning');
    btn.disabled = true;
    await attemptStartOllama();
    btn.classList.remove('spinning');
    btn.disabled = false;
  });

  // Theme toggle
  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);

  // Collapsible section toggles (API Keys + Models headers)
  initSectionToggles();

  // API key provider rows (expand/collapse each provider within API Keys)
  initApiKeyRows();

  // Discover models
  refreshModels();
});

// ─── SECTION TOGGLES (top-level collapse headers) ────────────────────────────

/**
 * Wire the "API Keys" and "Models" section-label-toggle buttons.
 * Each button toggles .collapsible-body--open on its target body element.
 * State is driven purely by aria-expanded on the button + the CSS class on body.
 */
function initSectionToggles() {
  document.querySelectorAll('.section-label-toggle').forEach(btn => {
    const bodyId = btn.getAttribute('aria-controls');
    const body   = document.getElementById(bodyId);
    if (!body) return;

    // Restore persisted state
    const key     = `llm-eval-section-${bodyId}`;
    const savedOpen = localStorage.getItem(key);
    // Default: API Keys closed, Models open
    const defaultOpen = bodyId === 'modelsBody';
    const isOpen = savedOpen !== null ? savedOpen === 'true' : defaultOpen;

    applySection(btn, body, isOpen);

    btn.addEventListener('click', () => {
      const nowOpen = !body.classList.contains('collapsible-body--open');
      applySection(btn, body, nowOpen);
      localStorage.setItem(key, String(nowOpen));
    });
  });
}

function applySection(btn, body, open) {
  btn.setAttribute('aria-expanded', String(open));
  body.classList.toggle('collapsible-body--open', open);
  body.setAttribute('aria-hidden', String(!open));
}

// ─── API KEY PROVIDER ROWS ────────────────────────────────────────────────────

/**
 * Each provider row inside #apiKeysBody has a header button that expands
 * the input field below it.  State is persisted in localStorage so the user
 * doesn't have to re-open their providers on every page load.
 */
function initApiKeyRows() {
  let open;
  try {
    open = new Set(JSON.parse(localStorage.getItem(KEY_API_KEYS) ?? '[]'));
  } catch {
    open = new Set();
  }

  document.querySelectorAll('.provider-row').forEach(row => {
    const provider = row.dataset.provider;
    const header   = row.querySelector('.provider-row-header');
    const body     = row.querySelector('.provider-row-body');
    if (!header || !body) return;

    // Restore
    const isOpen = open.has(provider);
    applyProviderRow(header, body, isOpen);

    header.addEventListener('click', () => {
      const nowOpen = body.hidden;          // if currently hidden → open it
      applyProviderRow(header, body, nowOpen);
      if (nowOpen) { open.add(provider); } else { open.delete(provider); }
      localStorage.setItem(KEY_API_KEYS, JSON.stringify([...open]));
    });
  });
}

function applyProviderRow(header, body, open) {
  header.setAttribute('aria-expanded', String(open));
  header.classList.toggle('active', open);
  body.hidden = !open;
}

// ─── OLLAMA START + REFRESH ──────────────────────────────────────────────────

/**
 * Called when the user explicitly clicks ↺.
 *
 * Logic:
 *   1. Check health first (cheap — avoids a 15 s wait if Ollama is already up)
 *   2. If already running  → just refresh the model list and return
 *   3. If not running      → call requestStart() which asks server.js to spawn
 *      `ollama serve` and blocks (up to 15 s) until it is ready
 *   4. On success          → refresh the model list so the new Ollama models appear
 *   5. On failure          → show an actionable error with the server's message
 */
async function attemptStartOllama() {
  setOllamaStatus('checking', 'Checking Ollama…');

  const health = await checkHealth();

  if (health.running) {
    // Already up — just refresh the model list
    await refreshModels();
    return;
  }

  // Not running — try to start it
  setOllamaStatus('checking', 'Starting ollama serve…');

  try {
    await requestStart();
    // requestStart() blocks until Ollama is ready, so we can refresh immediately
    await refreshModels();
  } catch (err) {
    // Surface the server's error message so the user knows what to do
    setOllamaStatus('error', err.message);
  }
}

// ─── MODEL DISCOVERY + REFRESH ───────────────────────────────────────────────

async function refreshModels() {
  setOllamaStatus('checking', 'Pinging localhost:11434…');
  setModelListState('loading');

  const health = await checkHealth();

  if (!health.running) {
    setOllamaStatus('stopped', 'Click ↺ to start · or auto-starts on Run');
    allModels      = buildModelList([], GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS,
                                    DEEPSEEK_MODELS, MISTRAL_MODELS, GROQ_MODELS);
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
    allModels      = buildModelList(ollamaModels, GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS,
                                    DEEPSEEK_MODELS, MISTRAL_MODELS, GROQ_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
  } catch (err) {
    setOllamaStatus('error', err.message);
    setModelListState('error', 'Could not load model list');
    allModels      = buildModelList([], GEMINI_MODELS, OPENAI_MODELS, ANTHROPIC_MODELS,
                                    DEEPSEEK_MODELS, MISTRAL_MODELS, GROQ_MODELS);
    selectedModels = renderModelList(allModels, document.getElementById('modelList'));
  }
}

// ─── MODEL LIST BUILDER ───────────────────────────────────────────────────────

function buildModelList(ollamaModels, geminiModels, openaiModels, anthropicModels, deepseekModels, mistralModels, groqModels) {
  // Colors are assigned per-backend in blocks so models from the same provider
  // share a hue family in charts. Each block of 4 colors in CHART_COLORS maps
  // to one backend: ollama=0-3, gemini=4-7, openai=8-11, anthropic=12-15,
  // deepseek=16-19, mistral=20-23, groq=24-27.
  const colorOffset = { ollama: 0, gemini: 4, openai: 8, anthropic: 12, deepseek: 16, mistral: 20, groq: 24 };
  const groupCount  = { ollama: 0, gemini: 0, openai: 0, anthropic: 0, deepseek: 0, mistral: 0, groq: 0 };

  function assignColor(backend) {
    const base  = colorOffset[backend] ?? 0;
    const count = groupCount[backend]  ?? 0;
    groupCount[backend] = count + 1;
    return CHART_COLORS[(base + count) % CHART_COLORS.length];
  }

  const merged = [
    ...ollamaModels.map(m => ({
      id:      m.id,
      label:   m.label,
      backend: 'ollama',
      active:  false,
      meta:    { family: m.family, parameterSize: m.parameterSize, sizeGb: m.sizeGb },
    })),
    ...(geminiModels    ?? []).map(m => ({ ...m, active: m.active ?? false })),
    ...(openaiModels    ?? []).map(m => ({ ...m, active: m.active ?? false })),
    ...(anthropicModels ?? []).map(m => ({ ...m, active: m.active ?? false })),
    ...(deepseekModels  ?? []).map(m => ({ ...m, active: m.active ?? false })),
    ...(mistralModels   ?? []).map(m => ({ ...m, active: m.active ?? false })),
    ...(groqModels      ?? []).map(m => ({ ...m, active: m.active ?? false })),
  ];

  return merged.map(m => ({ ...m, color: assignColor(m.backend) }));
}
