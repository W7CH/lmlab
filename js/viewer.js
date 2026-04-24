/**
 * viewer.js  —  Entry point for the read-only shareable viewer
 *
 * Boot sequence:
 *   1. Apply theme (no flash — runs before first paint via inline script in viewer.html)
 *   2. Read ?data= from the URL
 *   3. Decompress with LZ-string + parse JSON
 *   4. Render prompt info, summary metrics, result cards, charts, compare table
 *
 * Reuses: ui.js (updateCard, markWinner, msToSec)
 *         charts.js (buildAllCharts, buildCompareTable)
 */

import { msToSec, updateCard, markWinner } from './ui.js';
import { buildAllCharts, buildCompareTable } from './charts.js';

// ─── THEME CONSTANTS ──────────────────────────────────────────────────────────

const HLJS_DARK  = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css';
const HLJS_LIGHT = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';
const KEY_THEME  = 'llm-eval-theme';

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

  // ── Result cards ──────────────────────────────────────────────────────────
  const grid = document.getElementById('resultsGrid');
  results.forEach(r => {
    const card     = document.createElement('div');
    card.className = 'result-card';
    card.id        = `card-${r.id}`;
    grid.appendChild(card);
    updateCard(r.id, r);
  });

  // ── Winner badge ──────────────────────────────────────────────────────────
  const successful = results.filter(r => r.status === 'ok');
  if (successful.length > 0) {
    const winner = successful.reduce((a, b) => a.elapsed < b.elapsed ? a : b);
    markWinner(winner.id);
  }

  // ── Summary metrics ───────────────────────────────────────────────────────
  populateSummary(results);

  // ── Charts + compare table ────────────────────────────────────────────────
  buildAllCharts(results);
  buildCompareTable(results, document.getElementById('compareBody'));

  // ── Reveal ────────────────────────────────────────────────────────────────
  document.getElementById('summarySection').classList.remove('hidden');
}

/**
 * Populate the five summary metric cards.
 * Mirrors the logic in eval.js:finalise() but works from plain result arrays.
 */
function populateSummary(results) {
  const successful = results.filter(r => r.status === 'ok');
  const failed     = results.filter(r => r.status === 'error');

  document.getElementById('metricModels').textContent  = results.length;
  document.getElementById('metricSuccess').textContent =
    `${successful.length} success · ${failed.length} failed`;

  if (successful.length === 0) return;

  const sorted  = [...successful].sort((a, b) => a.elapsed - b.elapsed);
  const winner  = sorted[0];
  const bestTps = successful.reduce((best, r) => {
    const tps     = r.tokens / (r.elapsed / 1000);
    const bestVal = best.tokens / (best.elapsed / 1000);
    return tps > bestVal ? r : best;
  });

  const avgElapsed     = Math.round(successful.reduce((s, r) => s + r.elapsed, 0) / successful.length);
  const avgTotalTokens = Math.round(
    successful.reduce((s, r) => s + (r.totalTokens ?? r.tokens), 0) / successful.length
  );

  document.getElementById('metricFastest').textContent      = msToSec(winner.elapsed);
  document.getElementById('metricFastestModel').textContent = winner.label;
  document.getElementById('metricAvg').textContent          = msToSec(avgElapsed);
  document.getElementById('metricTps').textContent          =
    (bestTps.tokens / (bestTps.elapsed / 1000)).toFixed(1) + ' tok/s';
  document.getElementById('metricTpsModel').textContent     = bestTps.label;
  document.getElementById('metricTokens').textContent       = avgTotalTokens;
}

// ─── ERROR STATE ──────────────────────────────────────────────────────────────

function showError(message) {
  const el = document.getElementById('viewerError');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

// ─── THEME ────────────────────────────────────────────────────────────────────

function initTheme() {
  const saved  = localStorage.getItem(KEY_THEME);
  const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (osDark ? 'dark' : 'light'));
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const link = document.getElementById('hljs-theme');
  if (link) link.href = theme === 'dark' ? HLJS_DARK : HLJS_LIGHT;

  if (typeof hljs !== 'undefined') {
    document.querySelectorAll('pre code[class*="language-"]').forEach(block => {
      delete block.dataset.highlighted;
      hljs.highlightElement(block);
    });
  }
  localStorage.setItem(KEY_THEME, theme);
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TAB_IDS = ['results', 'compare', 'chart', 'throughput', 'tokens'];

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(name) {
  TAB_IDS.forEach(t => {
    document.getElementById(`tab${t[0].toUpperCase()}${t.slice(1)}`)
      ?.classList.toggle('hidden', t !== name);
  });
  document.querySelectorAll('.tab-btn')
    .forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
}
