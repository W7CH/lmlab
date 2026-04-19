/**
 * eval.js
 *
 * Orchestrates a full evaluation run:
 *   0. Pre-flight: ensure Ollama is running (auto-start if needed)
 *   1. Read prompt + parameters from the UI
 *   2. Fire all selected models in parallel (Promise.allSettled)
 *   3. Update each result card as responses arrive
 *   4. Compute summary statistics once everything settles
 *
 * Depends on: api.js, ollama.js, ui.js, charts.js
 */

import { callOllama, callGemini }        from './api.js';
import { ensureOllamaRunning }           from './ollama.js';
import {
  setStatus,
  setOllamaStatus,
  insertLoadingCard,
  updateCard,
  markWinner,
  hideEmptyState,
  hideSummary,
  renderSummary,
} from './ui.js';
import { buildLatencyChart, buildCompareTable } from './charts.js';

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

/**
 * Run an evaluation over the selected models.
 *
 * @param {Array}       models       - Full MODELS array from config.js
 * @param {Set<string>} selectedIds  - IDs of models the user toggled on
 * @returns {Promise<void>}
 */
export async function runEval(models, selectedIds) {
  // ── 1. Validate inputs ────────────────────────────────────────────────────
  if (selectedIds.size === 0) {
    setStatus('error', 'Select at least one model before running.');
    return;
  }

  const prompt = document.getElementById('promptInput').value.trim();
  if (!prompt) {
    setStatus('error', 'Enter a prompt before running.');
    return;
  }

  const temperature = parseFloat(document.getElementById('tempInput').value);
  const maxTokens   = parseInt(document.getElementById('maxTokensInput').value, 10);
  const apiKey      = document.getElementById('apiKeyInput').value.trim();

  const modelsToRun = models.filter(m => selectedIds.has(m.id));
  const needsOllama = modelsToRun.some(m => m.backend === 'ollama');

  // ── 2. Disable UI ─────────────────────────────────────────────────────────
  const runBtn = document.getElementById('runBtn');
  runBtn.disabled = true;
  hideSummary();
  hideEmptyState();

  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = '';

  // ── 3. Ollama pre-flight (only if any Ollama models are selected) ──────────
  if (needsOllama) {
    setStatus('running', 'Checking Ollama…');

    try {
      await ensureOllamaRunning((msg) => {
        setStatus('running', msg);
        setOllamaStatus('checking', msg);
      });

      setOllamaStatus('running', 'Ollama is running');
    } catch (err) {
      setStatus('error', err.message);
      setOllamaStatus('error', 'Ollama failed to start');
      runBtn.disabled = false;
      return;
    }
  }

  // ── 4. Start wall-clock timer in header badge ─────────────────────────────────────────────
  setStatus('running', `Running ${selectedIds.size} model(s) in parallel…`);

  const runStart      = Date.now();
  const timerBadge    = document.getElementById('runTimer');
  const timerInterval = setInterval(() => {
    timerBadge.textContent = `${((Date.now() - runStart) / 1000).toFixed(1)}s`;
  }, 100);

  // ── 5. Insert loading-state cards ─────────────────────────────────────────
  modelsToRun.forEach(m => insertLoadingCard(m, grid));

  // ── 6. Fire all requests in parallel ─────────────────────────────────────
  const resultsMap = {};

  const tasks = modelsToRun.map(async (m) => {
    const start = Date.now();
    try {
      const res = m.backend === 'ollama'
        ? await callOllama(m.id, prompt, temperature, maxTokens)
        : await callGemini(m.id, prompt, temperature, maxTokens, apiKey);

      const elapsed = Date.now() - start;
      resultsMap[m.id] = { status: 'ok', ...res, elapsed, model: m };
    } catch (err) {
      const elapsed = Date.now() - start;
      resultsMap[m.id] = { status: 'error', error: err.message, elapsed, model: m };
    } finally {
      // Update the card as soon as this model responds (don't wait for others)
      updateCard(m.id, resultsMap[m.id]);
    }
  });

  await Promise.allSettled(tasks);

  // ── 7. Teardown ───────────────────────────────────────────────────────────
  clearInterval(timerInterval);
  const totalMs = Date.now() - runStart;
  timerBadge.textContent = `${(totalMs / 1000).toFixed(2)}s total`;
  runBtn.disabled = false;

  // ── 8. Finalise results ───────────────────────────────────────────────────
  finalise(resultsMap);
}

// ─── PRIVATE ──────────────────────────────────────────────────────────────────

function finalise(resultsMap) {
  const all        = Object.values(resultsMap);
  const successful = all.filter(r => r.status === 'ok');
  const failed     = all.filter(r => r.status === 'error');

  setStatus('done', `Done — ${successful.length} succeeded, ${failed.length} failed.`);

  if (successful.length === 0) return;

  // Sort by latency to find the winner
  successful.sort((a, b) => a.elapsed - b.elapsed);
  const winner = successful[0];
  markWinner(winner.model.id);

  // Summary metric cards
  const avgLatency = Math.round(successful.reduce((s, r) => s + r.elapsed, 0) / successful.length);
  const avgTokens  = Math.round(successful.reduce((s, r) => s + r.tokens,  0) / successful.length);

  renderSummary({
    total:      all.length,
    success:    successful.length,
    failed:     failed.length,
    fastest:    winner,
    avgLatency,
    avgTokens,
  });

  // Charts
  buildLatencyChart(all, document.getElementById('latencyChart'));
  buildCompareTable(all, document.getElementById('compareBody'));
}
