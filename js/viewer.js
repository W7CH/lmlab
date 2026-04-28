/**
 * viewer.js  —  Entry point for the read-only shareable viewer
 *
 * Boot sequence:
 *   1. Apply theme (no flash — inline script in <head> runs before first paint)
 *   2. Read ?data= from the URL, decompress with LZ-string, parse JSON
 *   3. Render prompt info, summary metrics, result cards, charts, compare table
 *
 * All rendering delegates to the same functions used by the main dashboard:
 *   ui.js     → updateCard, markWinner, renderSummary
 *   charts.js → buildAllCharts, buildCompareTable
 *   theme.js  → initTheme, toggleTheme
 *   tabs.js   → initTabs
 */

import { updateCard, markWinner, renderSummary } from './ui.js';
import { buildAllCharts, buildCompareTable } from './charts.js';
import { initTheme, toggleTheme } from './theme.js';
import { initTabs } from './tabs.js';

// ─── BOOT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
  initTabs();

  const payload = loadPayload();
  if (!payload) {
    showError('Invalid or missing share data. Make sure you copied the complete link.');
    return;
  }

  renderView(payload);
});

// ─── PAYLOAD ──────────────────────────────────────────────────────────────────

function loadPayload() {
  const raw = new URLSearchParams(location.search).get('data');
  if (!raw) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(raw);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderView(payload) {
  // ── Prompt section ────────────────────────────────────────────────────────
  document.getElementById('viewerPromptText').textContent = payload.prompt ?? '';
  document.getElementById('viewerParams').innerHTML =
    `<span class="viewer-param-badge">Temp: ${payload.temperature}</span>` +
    `<span class="viewer-param-badge">Max tokens: ${payload.maxTokens}</span>`;

  if (payload.ts) {
    document.getElementById('viewerTimestamp').textContent =
      new Date(payload.ts).toLocaleString();
  }

  document.getElementById('viewerPromptSection').classList.remove('hidden');

  // ── Normalise results: attach .model sub-object expected by ui.js / charts.js ──
  const results = (payload.results ?? []).map(r => ({
    ...r,
    model: { id: r.id, label: r.label, backend: r.backend, color: r.color },
  }));

  // ── Result cards (reuses updateCard from ui.js) ───────────────────────────
  const grid = document.getElementById('resultsGrid');
  results.forEach(r => {
    const card     = document.createElement('div');
    card.className = 'result-card';
    card.id        = `card-${r.id}`;
    grid.appendChild(card);
    updateCard(r.id, r);
  });

  // ── Summary metrics + winner badge (reuses renderSummary / markWinner) ──
  const successful = results.filter(r => r.status === 'ok');

  if (successful.length > 0) {
    const sorted  = [...successful].sort((a, b) => a.elapsed - b.elapsed);
    const fastest = sorted[0];
    markWinner(fastest.id);

    const bestTps = successful.reduce((best, r) =>
      (r.tokens / (r.elapsed / 1000)) > (best.tokens / (best.elapsed / 1000)) ? r : best
    );
    const avgElapsed     = Math.round(successful.reduce((s, r) => s + r.elapsed, 0) / successful.length);
    const avgTotalTokens = Math.round(
      successful.reduce((s, r) => s + (r.totalTokens ?? r.tokens), 0) / successful.length
    );

    renderSummary({
      total:        results.length,
      success:      successful.length,
      failed:       results.length - successful.length,
      fastest,
      bestTps,
      avgElapsed,
      avgTokens:    avgTotalTokens,
      avgTotalTokens,
    });
  } else {
    // No successful results — reveal section with partial info only
    document.getElementById('summarySection').classList.remove('hidden');
    document.getElementById('metricModels').textContent  = results.length;
    document.getElementById('metricSuccess').textContent = `0 success · ${results.length} failed`;
  }

  // ── Charts + compare table (reuses buildAllCharts / buildCompareTable) ──
  buildAllCharts(results);
  buildCompareTable(results, document.getElementById('compareBody'));
}

// ─── ERROR STATE ──────────────────────────────────────────────────────────────

function showError(message) {
  const el = document.getElementById('viewerError');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}
