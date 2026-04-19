/**
 * charts.js
 *
 * Builds the two data-visualisation panels:
 *   1. Latency bar chart  (horizontal bars, CSS-animated)
 *   2. Compare table      (ranked by latency, shows tok/sec)
 *
 * Both functions accept the same `results` array for consistency.
 */

// Colour ramp cycled across bar chart bars (matches model accent colours in config).
const BAR_COLORS = [
  '#6c8bff', '#a78bfa', '#34d399',
  '#f59e0b', '#f472b6', '#60a5fa',
];

// ─── LATENCY BAR CHART ────────────────────────────────────────────────────────

/**
 * Render a horizontal latency bar chart.
 *
 * @param {Array<{ status: string, elapsed: number, model: Object }>} results
 * @param {HTMLElement} container   - The .bar-chart wrapper element
 */
export function buildLatencyChart(results, container) {
  container.innerHTML = '';

  const successful = results
    .filter(r => r.status === 'ok')
    .sort((a, b) => a.elapsed - b.elapsed);

  if (successful.length === 0) return;

  const max = Math.max(...successful.map(r => r.elapsed));

  successful.forEach((r, i) => {
    // Minimum bar width of 5% so label is always readable
    const pct   = Math.max(5, Math.round((r.elapsed / max) * 100));
    const color = BAR_COLORS[i % BAR_COLORS.length];

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${r.model.label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${pct}%; background: ${color};">
          ${r.elapsed}ms
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}

// ─── COMPARE TABLE ───────────────────────────────────────────────────────────

/**
 * Populate the comparison table body.
 * Rows are sorted: successful models by ascending latency, errors last.
 *
 * @param {Array} results
 * @param {HTMLElement} tbody   - The <tbody> element to fill
 */
export function buildCompareTable(results, tbody) {
  tbody.innerHTML = '';

  const sorted = [...results].sort((a, b) => {
    if (a.status === 'error' && b.status !== 'error') return  1;
    if (b.status === 'error' && a.status !== 'error') return -1;
    return a.elapsed - b.elapsed;
  });

  sorted.forEach((r, i) => {
    const isOk = r.status === 'ok';

    // Rank only applies to successful rows
    const rank      = isOk ? i + 1 : null;
    const rankClass = rank && rank <= 3 ? `rank-${rank}` : '';
    const rankCell  = rank
      ? `<span class="rank-badge ${rankClass}">${rank}</span>`
      : '—';

    // Tokens per second (est.)
    const tps = isOk && r.elapsed > 0
      ? (r.tokens / (r.elapsed / 1000)).toFixed(1)
      : '—';

    const latencyColor = isOk ? 'var(--warn)' : 'var(--danger)';
    const latencyVal   = isOk ? `${r.elapsed}` : '—';
    const tokensVal    = isOk ? r.tokens : '—';

    const statusBadge = isOk
      ? `<span class="badge badge-winner">ok</span>`
      : `<span class="badge badge-error">error</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rankCell}</td>
      <td style="font-family: var(--font-ui); font-weight: 500;">${r.model.label}</td>
      <td><span class="badge badge-${r.model.backend}">${r.model.backend}</span></td>
      <td style="color: ${latencyColor};">${latencyVal}</td>
      <td>${tokensVal}</td>
      <td>${tps}</td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}
