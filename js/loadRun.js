/**
 * loadRun.js
 *
 * Restores a saved run into the main dashboard UI without calling any APIs.
 * Reuses every existing rendering function — cards, charts, table, summary —
 * so the loaded view is pixel-identical to a live run.
 *
 * Also handles "Rerun": re-fires the saved prompt/models through the live
 * APIs, with an Ollama health guard before starting.
 */

import {
  setStatus, setOllamaStatus,
  insertLoadingCard, updateCard, markWinner,
  hideEmptyState, hideSummary, renderSummary,
} from './ui/ui.js';
import { buildAllCharts, buildCompareTable } from './ui/charts.js';
import { showShareButton } from './core/share.js';
import { runEval }         from './eval.js';
import { showJudgeSection, hideJudgeSection, renderEvaluationResults } from './judge.js';
import { truncate }        from './utils.js';
import { checkHealth, requestStart } from './api/ollama.js';

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

/**
 * Load a saved run into the dashboard UI (view-only, no API calls).
 *
 * Steps:
 *   1. Set prompt textarea to saved prompt
 *   2. Clear existing results area
 *   3. Render cards, charts, table, summary from stored data
 *   4. Expose the run to share.js so the Share button still works
 *   5. Show "Loaded from saved run" banner in status bar
 *
 * @param {import('./runs.js').RunRecord} run
 */
export function loadRunIntoUI(run) {
  const { prompt, systemPrompt, params, results } = run;

  // ── 1. Restore prompt and params ─────────────────────────────────────────
  const sysEl = document.getElementById('systemPromptInput');
  if (sysEl) sysEl.value = systemPrompt ?? '';

  const promptEl = document.getElementById('promptInput');
  if (promptEl) promptEl.value = prompt;

  const tempEl = document.getElementById('tempInput');
  if (tempEl && params?.temperature != null) tempEl.value = params.temperature;

  const maxTokEl = document.getElementById('maxTokensInput');
  if (maxTokEl && params?.maxTokens != null) maxTokEl.value = params.maxTokens;

  // ── 2. Reset results area ────────────────────────────────────────────────
  hideSummary();
  hideEmptyState();
  document.getElementById('resultsGrid').innerHTML = '';
  document.getElementById('saveRunBtn')?.classList.add('hidden');

  // ── 3. Render results ────────────────────────────────────────────────────
  const grid = document.getElementById('resultsGrid');
  results.forEach(r => {
    insertLoadingCard(r.model, grid);
    updateCard(r.model.id, r);
  });

  // ── 4. Summary stats ─────────────────────────────────────────────────────
  finaliseLoaded(results);

  // ── 5. Status bar ────────────────────────────────────────────────────────
  const when = new Date(run.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  setStatus('done', `Loaded: "${truncate(run.title, 50)}" — saved ${when}`);

  // ── 6. Restore evaluation if present (only for multi-model runs) ─────────
  if (results.length > 1 && run.evaluation) {
    showJudgeSection();
    renderEvaluationResults(run.evaluation, results);
  } else {
    hideJudgeSection();
  }

  // Inject a fresh Share button with a closure over this run's data.
  // showShareButton() removes any stale button from a previous live run first.
  showShareButton(
    prompt,
    systemPrompt ?? '',
    params?.temperature ?? 0.7,
    params?.maxTokens   ?? 1024,
    Object.fromEntries(results.map(r => [r.model.id, r])),
  );
}

/**
 * Re-run a saved run through the live APIs.
 * Guards against missing Ollama before starting.
 * Shows progress inline in the runs panel status area.
 *
 * @param {import('./runs.js').RunRecord} run
 * @param {Map<string, object>}  allModels     — full model list from main.js
 * @param {Set<string>}          selectedIds   — mutated to match the saved run's models
 * @param {HTMLElement}          statusEl      — panel element to show Ollama status
 */
export async function rerunSavedRun(run, allModels, selectedIds, statusEl, closePanel) {
  const savedModelIds = run.results.map(r => r.model.id);
  const needsOllama   = run.results.some(r => r.model.backend === 'ollama');

  // ── Ollama guard ──────────────────────────────────────────────────────────
  if (needsOllama) {
    setInlineStatus(statusEl, 'checking', 'Checking Ollama…');

    const health = await checkHealth();
    if (!health.running) {
      setInlineStatus(statusEl, 'starting', 'Starting Ollama…');
      try {
        await requestStart();
        setInlineStatus(statusEl, 'running', 'Ollama ready');
      } catch (err) {
        setInlineStatus(statusEl, 'error', `Ollama failed: ${err.message}`);
        return;   // abort rerun
      }
    } else {
      setInlineStatus(statusEl, 'running', 'Ollama running');
    }
  }

  // ── Restore prompt + select the saved models ──────────────────────────────
  const sysRerunEl = document.getElementById('systemPromptInput');
  if (sysRerunEl) sysRerunEl.value = run.systemPrompt ?? '';

  const promptEl = document.getElementById('promptInput');
  if (promptEl) promptEl.value = run.prompt;

  const tempEl = document.getElementById('tempInput');
  if (tempEl && run.params?.temperature != null) tempEl.value = run.params.temperature;

  const maxTokEl = document.getElementById('maxTokensInput');
  if (maxTokEl && run.params?.maxTokens != null) maxTokEl.value = run.params.maxTokens;

  // Mutate the selectedIds set to match saved models
  selectedIds.clear();
  savedModelIds.forEach(id => {
    if (allModels.some(m => m.id === id)) selectedIds.add(id);
  });

  // Ollama confirmed ready — close panel and fire the run
  setInlineStatus(statusEl, '', '');
  if (closePanel) closePanel();
  runEval(allModels, selectedIds);
}

// ─── PRIVATE ─────────────────────────────────────────────────────────────────

function finaliseLoaded(results) {
  const all        = results;
  const successful = all.filter(r => r.status === 'ok');
  if (successful.length === 0) return;

  successful.sort((a, b) => a.elapsed - b.elapsed);
  const winner = successful[0];
  markWinner(winner.model.id);

  const bestTps = successful.reduce((best, r) => {
    return (r.tokens / (r.elapsed / 1000)) > (best.tokens / (best.elapsed / 1000)) ? r : best;
  });

  const avgElapsed     = Math.round(successful.reduce((s, r) => s + r.elapsed,                    0) / successful.length);
  const avgTotalTokens = Math.round(successful.reduce((s, r) => s + (r.totalTokens ?? r.tokens ?? 0), 0) / successful.length);

  renderSummary({
    total:        all.length,
    success:      successful.length,
    failed:       all.length - successful.length,
    fastest:      winner,
    bestTps,
    avgElapsed,
    avgTokens:    avgTotalTokens,
    avgTotalTokens,
  });

  buildAllCharts(all);
  buildCompareTable(all, document.getElementById('compareBody'));
}

function setInlineStatus(el, state, msg) {
  if (!el) return;
  el.textContent  = msg;
  el.dataset.state = state;
}

