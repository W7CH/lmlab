/**
 * charts.js
 *
 * Two data-visualisation panels:
 *   1. Latency bar chart  — horizontal bars, CSS-animated, latency in seconds
 *   2. Compare table      — ranked by latency, tok/sec, latency in seconds
 */

import { msToSec } from './ui.js';

// ─── LATENCY BAR CHART ────────────────────────────────────────────────────────

/**
 * @param {Array<{ status, elapsed, model: { label, color } }>} results
 * @param {HTMLElement} container
 */
export function buildLatencyChart(results, container) {
  container.innerHTML = '';

  const successful = results
    .filter(r => r.status === 'ok')
    .sort((a, b) => a.elapsed - b.elapsed);

  if (successful.length === 0) return;

  const max = Math.max(...successful.map(r => r.elapsed));

  successful.forEach(r => {
    // Minimum bar width of 5% so label is always readable
    const pct   = Math.max(5, Math.round((r.elapsed / max) * 100));
    const color = r.model.color ?? '#6c8bff';

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${r.model.label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${pct}%; background: ${color};">
          ${msToSec(r.elapsed)}
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ─── COMPARE TABLE ───────────────────────────────────────────────────────────

/**
 * @param {Array} results
 * @param {HTMLElement} tbody
 */
export function buildCompareTable(results, tbody) {
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

    const rank      = isOk ? ++successRank : null;
    const rankClass = rank && rank <= 3 ? `rank-${rank}` : '';
    const rankCell  = rank
      ? `<span class="rank-badge ${rankClass}">${rank}</span>`
      : '—';

    // tok/sec — divide tokens by elapsed seconds
    const tps = isOk && r.elapsed > 0
      ? (r.tokens / (r.elapsed / 1000)).toFixed(1)
      : '—';

    const latencyColor = isOk ? 'var(--warn)' : 'var(--danger)';
    const latencyVal   = isOk ? msToSec(r.elapsed) : '—';

    const statusBadge = isOk
      ? `<span class="badge badge-winner">ok</span>`
      : `<span class="badge badge-error">error</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rankCell}</td>
      <td style="font-family: var(--font-ui); font-weight: 500;">${r.model.label}</td>
      <td><span class="badge badge-${r.model.backend}">${r.model.backend}</span></td>
      <td style="color: ${latencyColor};">${latencyVal}</td>
      <td>${isOk ? r.tokens : '—'}</td>
      <td>${tps}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}
