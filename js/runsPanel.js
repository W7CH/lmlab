/**
 * runsPanel.js
 *
 * Saved Runs slide-in drawer.
 *
 * The drawer lists all saved runs (newest first).
 * Each item supports:
 *   • Load     — restore run into the dashboard (no API call)
 *   • Rerun    — re-fire through live APIs (with Ollama guard)
 *   • Rename   — inline edit of the title
 *   • Export   — download run as JSON
 *   • Delete   — remove from localStorage
 *
 * The panel is a DOM element that already exists in index.html.
 * This module handles open/close and rendering only.
 */

import { loadAllRuns, deleteRun, renameRun, exportRunJson } from './runs.js';
import { loadRunIntoUI, rerunSavedRun } from './loadRun.js';
import { truncate, escHtml } from './utils.js';

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

/**
 * Open the Saved Runs drawer.
 * Refreshes the list every time it opens.
 *
 * @param {object[]} allModels    — from main.js live state
 * @param {Set<string>} selectedIds
 */
export function openRunsPanel(allModels, selectedIds) {
  _allModels   = allModels;
  _selectedIds = selectedIds;
  renderList();
  panel().classList.add('runs-panel--open');
  backdrop().classList.add('runs-backdrop--visible');
  document.addEventListener('keydown', onKeyDown);
}

export function closeRunsPanel() {
  panel().classList.remove('runs-panel--open');
  backdrop().classList.remove('runs-backdrop--visible');
  document.removeEventListener('keydown', onKeyDown);
}

// ─── STATE ────────────────────────────────────────────────────────────────────

let _allModels   = [];
let _selectedIds = new Set();

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderList() {
  const list = document.getElementById('runsList');
  if (!list) return;

  const runs = loadAllRuns();

  if (runs.length === 0) {
    const countEl2 = document.getElementById('runsPanelCount');
    if (countEl2) countEl2.textContent = '0 runs';
    list.innerHTML = `
      <div class="runs-empty">
        <div class="runs-empty-icon">◎</div>
        <div class="runs-empty-title">No saved runs yet</div>
        <div class="runs-empty-sub">Complete an evaluation and click "Save Run" to store it here.</div>
      </div>`;
    return;
  }

  // Update count badge in panel header
  const countEl = document.getElementById('runsPanelCount');
  if (countEl) countEl.textContent = `${runs.length} run${runs.length !== 1 ? 's' : ''}`;

  list.innerHTML = '';

  runs.forEach(run => {
    const item = document.createElement('div');
    item.className    = 'run-item';
    item.dataset.runId = run.id;

    const when       = formatDate(run.createdAt);
    const modelCount = run.results.length;
    const succCount  = run.results.filter(r => r.status === 'ok').length;
    const backends   = [...new Set(run.results.map(r => r.model.backend))];
    const hasOllama  = backends.includes('ollama');

    item.innerHTML = `
      <div class="run-item-header">
        <div class="run-item-title" title="${escHtml(run.title)}">${escHtml(run.title)}</div>
        <button class="run-item-delete" title="Delete run" data-id="${run.id}" aria-label="Delete">✕</button>
      </div>
      <div class="run-item-meta">
        <span class="run-item-when">${when}</span>
        <span class="run-item-sep">·</span>
        <span class="run-item-count">${succCount}/${modelCount} model${modelCount !== 1 ? 's' : ''}</span>
        <span class="run-item-sep">·</span>
        <span class="run-item-backends">${backends.map(b => `<span class="badge badge-${b}">${b}</span>`).join(' ')}</span>
      </div>
      <div class="run-item-prompt">${escHtml(truncate(run.prompt, 100))}</div>
      <div class="run-item-actions">
        <button class="run-action-btn run-action-load"   data-id="${run.id}">Load</button>
        <button class="run-action-btn run-action-rerun"  data-id="${run.id}" ${hasOllama ? 'data-needs-ollama="true"' : ''}>Rerun</button>
        <button class="run-action-btn run-action-rename" data-id="${run.id}">Rename</button>
        <button class="run-action-btn run-action-export" data-id="${run.id}">Download</button>
      </div>
      <div class="run-item-status" data-id="${run.id}"></div>
    `;

    // ── Bind actions ─────────────────────────────────────────────────────────
    item.querySelector('.run-item-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteRun(run.id);
      item.classList.add('run-item--removing');
      setTimeout(() => { item.remove(); checkEmpty(list); }, 250);
    });

    item.querySelector('.run-action-load').addEventListener('click', () => {
      loadRunIntoUI(run);
      closeRunsPanel();
    });

    item.querySelector('.run-action-rerun').addEventListener('click', async () => {
      const statusEl = item.querySelector(`.run-item-status[data-id="${run.id}"]`);
      // Keep panel open during Ollama guard so the user sees status feedback.
      // rerunSavedRun closes the panel itself once Ollama is confirmed ready.
      await rerunSavedRun(run, _allModels, _selectedIds, statusEl, closeRunsPanel);
    });

    item.querySelector('.run-action-rename').addEventListener('click', () => {
      inlineRename(run, item);
    });

    item.querySelector('.run-action-export').addEventListener('click', () => {
      exportRunJson(run.id);
    });

    list.appendChild(item);
  });
}

// ─── INLINE RENAME ───────────────────────────────────────────────────────────

function inlineRename(run, item) {
  const titleEl = item.querySelector('.run-item-title');
  const current = run.title;

  const input = document.createElement('input');
  input.className = 'run-rename-input';
  input.value     = current;
  input.maxLength = 120;

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newTitle = input.value.trim() || current;
    renameRun(run.id, newTitle);
    run.title = newTitle;               // update in-memory copy
    const newTitle2 = document.createElement('div');
    newTitle2.className = 'run-item-title';
    newTitle2.title     = newTitle;
    newTitle2.textContent = newTitle;
    input.replaceWith(newTitle2);
  };

  input.addEventListener('blur',  commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function checkEmpty(list) {
  if (list.querySelectorAll('.run-item').length === 0) {
    list.innerHTML = `
      <div class="runs-empty">
        <div class="runs-empty-icon">◎</div>
        <div class="runs-empty-title">No saved runs</div>
        <div class="runs-empty-sub">Save a run after evaluation to see it here.</div>
      </div>`;
  }
}

function panel()    { return document.getElementById('runsPanel'); }
function backdrop() { return document.getElementById('runsBackdrop'); }

function onKeyDown(e) {
  if (e.key === 'Escape') closeRunsPanel();
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

