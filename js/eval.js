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

import { callOllama, callGemini, callOpenAI, callAnthropic, callDeepSeek, callMistral, callGroq } from './api/llm.js';
import { ensureOllamaRunning } from './api/ollama.js';
import {
  setStatus,
  setOllamaStatus,
  insertLoadingCard,
  updateCard,
  markWinner,
  hideEmptyState,
  hideSummary,
  renderSummary,
} from './ui/ui.js';
import { buildAllCharts, buildCompareTable } from './ui/charts.js';
import { showShareButton } from './core/share.js';
import { saveRun } from './core/runs.js';
import { readApiKeys } from './utils.js';
import { showJudgeSection, hideJudgeSection, getLastEvaluation } from './judge.js';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

// Holds the most recent completed run snapshot for the Save Run button
let _pendingSnapshot = null;

// Non-null while a run is in progress; abort() cancels all in-flight requests
let _currentController = null;

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

/** True while a run is active. Used by main.js to branch the button click. */
export function isRunning() { return _currentController !== null; }

/** Abort all in-flight requests for the current run. */
export function cancelRun() { _currentController?.abort(); }

/** Returns the last completed run's data for the judge. */
export function getLastRunData() { return _pendingSnapshot; }

/**
 * Called by main.js when the user clicks "Save Run".
 * Returns the saved RunRecord or null if nothing to save.
 */
export function savePendingRun() {
  if (!_pendingSnapshot) return null;
  return saveRun({ ..._pendingSnapshot, evaluation: getLastEvaluation() });
}

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

  const systemPrompt = document.getElementById('systemPromptInput').value.trim();
  const temperature  = parseFloat(document.getElementById('tempInput').value);
  const maxTokens    = parseInt(document.getElementById('maxTokensInput').value, 10);
  const { geminiKey, openaiKey, anthropicKey, deepseekKey, mistralKey, groqKey } = readApiKeys();

  const modelsToRun = models.filter(m => selectedIds.has(m.id));
  const needsOllama = modelsToRun.some(m => m.backend === 'ollama');

  // ── 2. Set up abort controller and transform button ───────────────────────
  _currentController = new AbortController();
  const { signal }   = _currentController;

  const runBtn = document.getElementById('runBtn');
  _pendingSnapshot = null;
  hideSummary();
  hideJudgeSection();
  hideEmptyState();
  document.getElementById('resultsGrid').innerHTML = '';
  document.getElementById('saveRunBtn')?.classList.add('hidden');
  setRunBtnCancelling(runBtn);

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
      _currentController = null;
      restoreRunBtn(runBtn);
      return;
    }

    // User may have clicked Cancel while Ollama was starting up
    if (signal.aborted) {
      _currentController = null;
      restoreRunBtn(runBtn);
      setStatus('idle', 'Run cancelled.');
      return;
    }
  }

  // ── 4. Start wall-clock timer in header badge ─────────────────────────────
  setStatus('running', `Running ${modelsToRun.length} model(s) in parallel…`);

  const runStart      = Date.now();
  const timerBadge    = document.getElementById('runTimer');
  const timerInterval = setInterval(() => {
    timerBadge.textContent = `${((Date.now() - runStart) / 1000).toFixed(1)}s`;
  }, 100);

  // ── 5. Insert loading-state cards ─────────────────────────────────────────
  const grid = document.getElementById('resultsGrid');
  modelsToRun.forEach(m => insertLoadingCard(m, grid));

  // ── 6. Fire all requests in parallel ─────────────────────────────────────
  const resultsMap = {};

  const tasks = modelsToRun.map(async m => {
    const start = Date.now();
    try {
      const res = await dispatch(m, prompt, systemPrompt, temperature, maxTokens, {
        geminiKey, openaiKey, anthropicKey, deepseekKey, mistralKey, groqKey,
      }, signal);
      const elapsed = Date.now() - start;
      if (!res.text.trim()) {
        throw new Error('Empty response — the model returned no content');
      }
      resultsMap[m.id] = {
        status:          'ok',
        text:            res.text,
        tokens:          res.tokens,
        promptTokens:    res.promptTokens ?? 0,
        totalTokens:     (res.tokens ?? 0) + (res.promptTokens ?? 0),
        tokensEstimated: res.tokensEstimated ?? false,
        chars:           res.text.length,
        elapsed,
        model: m,
      };
    } catch (err) {
      const cancelled = err.name === 'AbortError';
      resultsMap[m.id] = {
        status:  cancelled ? 'cancelled' : 'error',
        error:   cancelled ? 'Run cancelled' : err.message,
        elapsed: Date.now() - start,
        model:   m,
      };
    } finally {
      updateCard(m.id, resultsMap[m.id]);
    }
  });

  await Promise.allSettled(tasks);

  // ── 7. Teardown ───────────────────────────────────────────────────────────
  clearInterval(timerInterval);
  timerBadge.textContent = `${((Date.now() - runStart) / 1000).toFixed(2)}s total`;
  _currentController = null;
  restoreRunBtn(runBtn);

  finalise(resultsMap, { prompt, systemPrompt, temperature, maxTokens });
  showShareButton(prompt, systemPrompt, temperature, maxTokens, resultsMap);
}

// ─── PRIVATE ──────────────────────────────────────────────────────────────────

/**
 * Route a single model call to the correct API function.
 * Every branch receives the AbortSignal so fetch is cancelled on demand.
 */
function dispatch(model, prompt, systemPrompt, temperature, maxTokens, keys, signal) {
  switch (model.backend) {
    case 'ollama':    return callOllama(model.id, prompt, systemPrompt, temperature, maxTokens, signal);
    case 'gemini':    return callGemini(model.id, prompt, systemPrompt, temperature, maxTokens, keys.geminiKey, signal);
    case 'openai':    return callOpenAI(model.id, prompt, systemPrompt, temperature, maxTokens, keys.openaiKey, signal);
    case 'anthropic': return callAnthropic(model.id, prompt, systemPrompt, temperature, maxTokens, keys.anthropicKey, signal);
    case 'deepseek':  return callDeepSeek(model.id, prompt, systemPrompt, temperature, maxTokens, keys.deepseekKey, signal);
    case 'mistral':   return callMistral(model.id, prompt, systemPrompt, temperature, maxTokens, keys.mistralKey, signal);
    case 'groq':      return callGroq(model.id, prompt, systemPrompt, temperature, maxTokens, keys.groqKey, signal);
    default:          return Promise.reject(new Error(`Unknown backend: ${model.backend}`));
  }
}

function finalise(resultsMap, { prompt, systemPrompt, temperature, maxTokens }) {
  const all        = Object.values(resultsMap);
  const successful = all.filter(r => r.status === 'ok');
  const cancelled  = all.filter(r => r.status === 'cancelled');
  const failed     = all.filter(r => r.status === 'error');

  // Build status message
  const wasCancelled = cancelled.length > 0;
  let statusMsg;
  if (wasCancelled) {
    const parts = [];
    if (successful.length) parts.push(`${successful.length} completed`);
    if (cancelled.length)  parts.push(`${cancelled.length} cancelled`);
    if (failed.length)     parts.push(`${failed.length} errored`);
    statusMsg = `Cancelled — ${parts.join(', ')}.`;
  } else {
    statusMsg = `Done — ${successful.length} succeeded, ${failed.length} failed.`;
  }
  setStatus(wasCancelled ? 'warn' : 'done', statusMsg);

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
    total: all.length, success: successful.length, failed: failed.length + cancelled.length,
    fastest: winner, bestTps,
    avgElapsed, avgTokens, avgTotalTokens,
  });

  buildAllCharts(all);
  buildCompareTable(all, document.getElementById('compareBody'));

  const snapshot = { prompt, systemPrompt, params: { temperature, maxTokens }, results: all };
  _pendingSnapshot = snapshot;
  document.getElementById('saveRunBtn')?.classList.remove('hidden');
  if (all.length > 1) showJudgeSection();
  else hideJudgeSection();
}

function setRunBtnCancelling(btn) {
  btn.innerHTML = '<span aria-hidden="true">✕</span> Cancel';
  btn.classList.add('run-btn--cancelling');
  btn.disabled = false;
}

function restoreRunBtn(btn) {
  btn.innerHTML = '<span aria-hidden="true">▶</span> Run Evaluation';
  btn.classList.remove('run-btn--cancelling');
  btn.disabled = false;
}
