/**
 * eval.js
 *
 * Orchestrates a full evaluation run:
 *   0. Pre-flight — ensure Ollama is running if any Ollama models are selected
 *   1. Read prompt + parameters from the UI
 *   2. Fire all selected models in parallel (Promise.allSettled)
 *   3. Update each result card as responses arrive
 *   4. Compute summary statistics once everything settles
 *   5. Collects: latency, completion tokens, prompt tokens, response length
 */

import { callOllama, callGemini, callOpenAI, callAnthropic, callDeepSeek, callMistral, callGroq } from './api.js';
import { ensureOllamaRunning } from './ollama.js';
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
import { buildAllCharts, buildCompareTable } from './charts.js';
import { showShareButton } from './share.js';
import { saveRun }   from './runs.js';

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

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

  const temperature  = parseFloat(document.getElementById('tempInput').value);
  const maxTokens    = parseInt(document.getElementById('maxTokensInput').value, 10);
  const geminiKey    = document.getElementById('geminiKeyInput').value.trim();
  const openaiKey    = document.getElementById('openaiKeyInput').value.trim();
  const anthropicKey = document.getElementById('anthropicKeyInput').value.trim();
  const deepseekKey  = document.getElementById('deepseekKeyInput').value.trim();
  const mistralKey   = document.getElementById('mistralKeyInput').value.trim();
  const groqKey      = document.getElementById('groqKeyInput').value.trim();

  const modelsToRun = models.filter(m => selectedIds.has(m.id));
  const needsOllama = modelsToRun.some(m => m.backend === 'ollama');

  // ── 2. Disable UI ─────────────────────────────────────────────────────────
  const runBtn = document.getElementById('runBtn');
  runBtn.disabled = true;
  _pendingSnapshot = null;
  hideSummary();
  hideEmptyState();
  document.getElementById('resultsGrid').innerHTML = '';
  document.getElementById('saveRunBtn')?.classList.add('hidden');

  // ── 3. Ollama pre-flight ──────────────────────────────────────────────────
  if (needsOllama) {
    setStatus('running', 'Checking Ollama…');
    try {
      await ensureOllamaRunning(msg => {
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
  setStatus('running', `Running ${modelsToRun.length} model(s) in parallel…`);

  const runStart      = Date.now();
  const timerBadge    = document.getElementById('runTimer');
  const timerInterval = setInterval(() => {
    timerBadge.textContent = `${((Date.now() - runStart) / 1000).toFixed(1)}s`;
  }, 100);

  // ── 5. Insert loading-state cards ──────────────────────────────────────────────────────
  const grid = document.getElementById('resultsGrid');
  modelsToRun.forEach(m => insertLoadingCard(m, grid));

  // ── 6. Fire all requests in parallel ─────────────────────────────────────
  const resultsMap = {};

  const tasks = modelsToRun.map(async m => {
    const start = Date.now();
    try {
      const res = await dispatch(m, prompt, temperature, maxTokens, {
        geminiKey, openaiKey, anthropicKey, deepseekKey, mistralKey, groqKey,
      });
      const elapsed = Date.now() - start;
      resultsMap[m.id] = {
        status:       'ok',
        text:         res.text,
        tokens:       res.tokens,
        promptTokens: res.promptTokens ?? 0,
        totalTokens:  (res.tokens ?? 0) + (res.promptTokens ?? 0),
        chars:        res.text.length,
        elapsed,
        model: m,
      };
    } catch (err) {
      resultsMap[m.id] = { status: 'error', error: err.message, elapsed: Date.now() - start, model: m };
    } finally {
      updateCard(m.id, resultsMap[m.id]);
    }
  });

  await Promise.allSettled(tasks);

  // ── 7. Teardown ───────────────────────────────────────────────────────────
  clearInterval(timerInterval);
  timerBadge.textContent = `${((Date.now() - runStart) / 1000).toFixed(2)}s total`;
  runBtn.disabled = false;

  finalise(resultsMap, { prompt, temperature, maxTokens });
  showShareButton(prompt, temperature, maxTokens, resultsMap);
}

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

// Holds the most recent completed run snapshot for the Save Run button
let _pendingSnapshot = null;

/**
 * Called by main.js when the user clicks "Save Run".
 * Returns the saved RunRecord or null if nothing to save.
 */
export function savePendingRun() {
  if (!_pendingSnapshot) return null;
  return saveRun(_pendingSnapshot);
}

// ─── PRIVATE ──────────────────────────────────────────────────────────────────

/**
 * Route a single model call to the correct API function.
 */
function dispatch(model, prompt, temperature, maxTokens, keys) {
  switch (model.backend) {
    case 'ollama':    return callOllama(model.id, prompt, temperature, maxTokens);
    case 'gemini':    return callGemini(model.id, prompt, temperature, maxTokens, keys.geminiKey);
    case 'openai':    return callOpenAI(model.id, prompt, temperature, maxTokens, keys.openaiKey);
    case 'anthropic': return callAnthropic(model.id, prompt, temperature, maxTokens, keys.anthropicKey);
    case 'deepseek':  return callDeepSeek(model.id, prompt, temperature, maxTokens, keys.deepseekKey);
    case 'mistral':   return callMistral(model.id, prompt, temperature, maxTokens, keys.mistralKey);
    case 'groq':      return callGroq(model.id, prompt, temperature, maxTokens, keys.groqKey);
    default:          return Promise.reject(new Error(`Unknown backend: ${model.backend}`));
  }
}

function finalise(resultsMap, { prompt, temperature, maxTokens }) {
  const all        = Object.values(resultsMap);
  const successful = all.filter(r => r.status === 'ok');
  const failed     = all.filter(r => r.status === 'error');

  setStatus('done', `Done — ${successful.length} succeeded, ${failed.length} failed.`);
  if (successful.length === 0) return;

  // Sort by latency — winner = fastest
  successful.sort((a, b) => a.elapsed - b.elapsed);
  const winner = successful[0];
  markWinner(winner.model.id);

  // Best throughput = most output tokens per second
  const bestTps = successful.reduce((best, r) => {
    const tps = r.tokens / (r.elapsed / 1000);
    return tps > (best.tokens / (best.elapsed / 1000)) ? r : best;
  });

  const avgElapsed     = Math.round(successful.reduce((s, r) => s + r.elapsed,     0) / successful.length);
  const avgTokens      = Math.round(successful.reduce((s, r) => s + r.tokens,      0) / successful.length);
  const avgTotalTokens = Math.round(successful.reduce((s, r) => s + r.totalTokens, 0) / successful.length);

  renderSummary({
    total: all.length, success: successful.length, failed: failed.length,
    fastest: winner, bestTps,
    avgElapsed, avgTokens, avgTotalTokens,
  });

  buildAllCharts(all);
  buildCompareTable(all, document.getElementById('compareBody'));

  const snapshot = { prompt, params: { temperature, maxTokens }, results: all };

  // Save to localStorage (for Saved Runs panel) — store but don't auto-name
  // The user clicks "Save Run" to persist; we store the snapshot for that click
  _pendingSnapshot = snapshot;

  // Show action buttons
  document.getElementById('saveRunBtn')?.classList.remove('hidden');
}
