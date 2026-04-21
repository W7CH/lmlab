/**
 * charts.js
 *
 * Builds all comparison charts and the ranked compare table.
 *
 * Charts rendered:
 *   1. Latency       — response time in seconds (lower = better)
 *   2. Throughput    — output tokens per second (higher = better)
 *   3. Token usage   — prompt + completion tokens stacked (lower = more efficient)
 *
 * All charts use the same horizontal bar design and per-model accent colors.
 */

import { msToSec } from './ui.js';

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

/**
 * Build every chart. Called by eval.js after all results arrive.
 * Each chart renders into its own container (already in index.html).
 * @param {Array} results
 */
export function buildAllCharts(results) {
  buildLatencyChart   (results, document.getElementById('latencyChart'));
  buildThroughputChart(results, document.getElementById('throughputChart'));
  buildTokenChart     (results, document.getElementById('tokenChart'));
}

// ─── 1. LATENCY ───────────────────────────────────────────────────────────────

export function buildLatencyChart(results, container) {
  if (!container) return;
  container.innerHTML = '';

  const ok  = results.filter(r => r.status === 'ok').sort((a, b) => a.elapsed - b.elapsed);
  if (ok.length === 0) return;

  const max = Math.max(...ok.map(r => r.elapsed));
  ok.forEach(r => {
    appendBar(container, r.model.label, r.model.color,
      r.elapsed / max, msToSec(r.elapsed));
  });
}

// ─── 2. THROUGHPUT ────────────────────────────────────────────────────────────

export function buildThroughputChart(results, container) {
  if (!container) return;
  container.innerHTML = '';

  const ok = results
    .filter(r => r.status === 'ok' && r.elapsed > 0)
    .map(r => ({ ...r, tps: r.tokens / (r.elapsed / 1000) }))
    .sort((a, b) => b.tps - a.tps);   // descending — higher is better

  if (ok.length === 0) return;

  const max = ok[0].tps;
  ok.forEach(r => {
    appendBar(container, r.model.label, r.model.color,
      r.tps / max, `${r.tps.toFixed(1)} tok/s`);
  });
}

// ─── 3. TOKEN USAGE ───────────────────────────────────────────────────────────

/**
 * Stacked bar: prompt tokens (muted) + completion tokens (accent).
 * Total width = proportion of the maximum totalTokens across models.
 */
export function buildTokenChart(results, container) {
  if (!container) return;
  container.innerHTML = '';

  const ok = results
    .filter(r => r.status === 'ok')
    .sort((a, b) => (b.totalTokens ?? 0) - (a.totalTokens ?? 0));  // descending total

  if (ok.length === 0) return;

  const max = Math.max(...ok.map(r => r.totalTokens ?? r.tokens));

  ok.forEach(r => {
    const total      = r.totalTokens ?? r.tokens;
    const prompt     = r.promptTokens ?? 0;
    const completion = r.tokens;
    // Widths relative to max total so bars are proportional across models
    const pctPrompt     = Math.max(0, (prompt     / max) * 100);
    const pctCompletion = Math.max(2, (completion / max) * 100);
    const hasPrompt     = prompt > 0;

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${r.model.label}</span>
      <div class="bar-track" style="display: flex; overflow: hidden;">
        ${hasPrompt ? `<div class="bar-fill bar-fill-prompt" style="width: ${pctPrompt.toFixed(1)}%; flex-shrink: 0;">
          ${pctPrompt > 8 ? prompt : ''}
        </div>` : ''}
        <div class="bar-fill" style="width: ${pctCompletion.toFixed(1)}%; background: ${r.model.color}; flex-shrink: 0;">
          ${pctCompletion > 8 ? completion : ''}
        </div>
      </div>
      <span class="bar-total">${total} tok</span>
    `;
    container.appendChild(row);
  });

  // Legend
  if (ok.some(r => (r.promptTokens ?? 0) > 0)) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    legend.innerHTML = `
      <span class="legend-dot legend-prompt"></span><span>Prompt tokens</span>
      <span class="legend-dot legend-completion"></span><span>Completion tokens</span>
    `;
    container.appendChild(legend);
  }
}

// ─── COMPARE TABLE ────────────────────────────────────────────────────────────

/**
 * @param {Array} results
 * @param {HTMLElement} tbody
 */
export function buildCompareTable(results, tbody) {
  if (!tbody) return;
  tbody.innerHTML = '';

  const sorted = [...results].sort((a, b) => {
    if (a.status === 'error' && b.status !== 'error') return  1;
    if (b.status === 'error' && a.status !== 'error') return -1;
    return a.elapsed - b.elapsed;
  });

  // Count only successful rows for rank numbering
  let successRank = 0;

  sorted.forEach(r => {
    const isOk = r.status === 'ok';
    const rank = isOk ? ++successRank : null;
    const rankCell = rank
      ? `<span class="rank-badge ${rank <= 3 ? `rank-${rank}` : ''}">${rank}</span>`
      : '—';

    // tok/sec — divide tokens by elapsed seconds
    const tps = isOk && r.elapsed > 0
      ? (r.tokens / (r.elapsed / 1000)).toFixed(1)
      : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rankCell}</td>
      <td style="font-family: var(--font-ui); font-weight: 500;">${r.model.label}</td>
      <td><span class="badge badge-${r.model.backend}">${r.model.backend}</span></td>
      <td style="color: ${isOk ? 'var(--warn)' : 'var(--danger)'};">${isOk ? msToSec(r.elapsed) : '—'}</td>
      <td>${isOk ? tps : '—'}</td>
      <td>${isOk ? r.promptTokens || '—' : '—'}</td>
      <td>${isOk ? r.tokens : '—'}</td>
      <td>${isOk ? r.totalTokens || r.tokens : '—'}</td>
      <td><span class="badge ${isOk ? 'badge-winner' : 'badge-error'}">${isOk ? 'ok' : 'error'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── SHARED HELPER ───────────────────────────────────────────────────────────

/**
 * Append a single horizontal bar row to a container.
 * @param {HTMLElement} container
 * @param {string}      label     — model name
 * @param {string}      color     — CSS color for the fill
 * @param {number}      ratio     — 0–1, proportion of max
 * @param {string}      valLabel  — text inside the bar
 */
function appendBar(container, label, color, ratio, valLabel) {
  const pct = Math.max(4, Math.round(ratio * 100));
  const row = document.createElement('div');
  row.className = 'bar-row';
  row.innerHTML = `
    <span class="bar-label">${label}</span>
    <div class="bar-track">
      <div class="bar-fill" style="width: ${pct}%; background: ${color};">
        ${valLabel}
      </div>
    </div>
  `;
  container.appendChild(row);
}
