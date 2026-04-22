/**
 * ui.js
 *
 * Pure DOM-manipulation helpers.
 * No fetch, no state — just building and updating elements.
 */

// ─── LATENCY FORMATTING ───────────────────────────────────────────────────────

/**
 * Convert milliseconds to a human-readable seconds string.
 *   312  → "0.31s"   1840 → "1.84s"   12500 → "12.5s"
 * @param {number} ms
 * @returns {string}
 */
export function msToSec(ms) {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(2)}s` : `${s.toFixed(1)}s`;
}

// ─── STATUS BAR ───────────────────────────────────────────────────────────────

export function setStatus(type, message) {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className    = `status-dot ${type}`;
  text.textContent = message;
}

// ─── MODEL LIST ───────────────────────────────────────────────────────────────

const BACKEND_ORDER  = ['ollama', 'gemini', 'openai', 'anthropic'];
const BACKEND_LABELS = { ollama: 'Ollama', gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };

// localStorage key for tracking which backend groups are collapsed
const KEY_MODEL_GROUPS = 'llm-eval-model-groups-collapsed';

/**
 * Show a skeleton loading state inside the model list container.
 */
export function setModelListState(state, message = '') {
  const container = document.getElementById('modelList');
  if (!container) return;

  if (state === 'loading') {
    container.innerHTML = Array.from({ length: 4 }, () => `
      <div class="model-item-skeleton">
        <div class="skeleton-dot"></div>
        <div class="skeleton-label"></div>
        <div class="skeleton-badge"></div>
      </div>
    `).join('');
  } else if (state === 'error') {
    container.innerHTML = `
      <div class="model-list-error">
        <span class="model-list-error-icon">⚠</span>
        <span>${message || 'Could not load models'}</span>
      </div>
    `;
  }
}

/**
 * Render models grouped by backend, each group in a collapsible accordion.
 *
 * Structure per group:
 *   <div class="model-group">
 *     <button class="model-group-header">  ← click to collapse/expand
 *       <span>Ollama</span>
 *       <span class="model-group-count">3</span>
 *       <span class="toggle-chevron">›</span>
 *     </button>
 *     <div class="model-group-body">
 *       <div class="model-item"> … </div>
 *       …
 *     </div>
 *   </div>
 *
 * Collapsed-group IDs are persisted to localStorage so state survives refresh.
 * Selection state (Set<string>) is preserved across re-renders because
 * `selected` is mutated in-place by click handlers.
 *
 * @param {Array}       models
 * @param {HTMLElement} container
 * @returns {Set<string>}
 */
export function renderModelList(models, container) {
  const selected  = new Set(models.filter(m => m.active).map(m => m.id));
  const collapsed = loadCollapsedGroups();

  container.innerHTML = '';

  if (models.length === 0) {
    container.innerHTML = `
      <div class="model-list-empty">
        No models found. Run <code>ollama pull &lt;model&gt;</code> to install one.
      </div>
    `;
    return selected;
  }

  // Group models by backend, preserving BACKEND_ORDER
  const groups = {};
  BACKEND_ORDER.forEach(b => { groups[b] = []; });
  models.forEach(m => {
    if (!groups[m.backend]) groups[m.backend] = [];
    groups[m.backend].push(m);
  });

  BACKEND_ORDER.forEach(backend => {
    const group = groups[backend];
    if (!group || group.length === 0) return;

    const isCollapsed = collapsed.has(backend);

    // ── Group wrapper ────────────────────────────────────────────────────────
    const groupEl = document.createElement('div');
    groupEl.className        = 'model-group';
    groupEl.dataset.backend  = backend;

    // ── Header button ────────────────────────────────────────────────────────
    const header = document.createElement('button');
    header.className        = 'model-group-header';
    header.setAttribute('aria-expanded', String(!isCollapsed));
    const selectedCount = group.filter(m => selected.has(m.id)).length;
    header.innerHTML = `
      <span class="model-group-name">${BACKEND_LABELS[backend] ?? backend}</span>
      <span class="model-group-count">${group.length}</span>
      ${selectedCount > 0
        ? `<span class="model-group-sel">${selectedCount} selected</span>`
        : ''}
      <span class="toggle-chevron" aria-hidden="true">›</span>
    `;

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = `model-group-body${isCollapsed ? '' : ' model-group-body--open'}`;

    group.forEach(m => {
      const item = document.createElement('div');
      item.className   = `model-item${selected.has(m.id) ? ' active' : ''}`;
      item.dataset.id  = m.id;

      // Size badge — only for Ollama models that have size info
      const sizeBadge = m.meta?.sizeGb
        ? `<span class="model-size">${m.meta.sizeGb} GB</span>`
        : '';

      item.innerHTML = `
        <div class="model-dot" style="--model-color: ${m.color};"></div>
        <span class="model-name" title="${m.id}">${m.label}</span>
        ${sizeBadge}
      `;

      item.addEventListener('click', () => {
        if (selected.has(m.id)) {
          selected.delete(m.id);
          item.classList.remove('active');
        } else {
          selected.add(m.id);
          item.classList.add('active');
        }
        // Update the "N selected" counter in the header
        refreshGroupCounter(header, group, selected);
      });

      body.appendChild(item);
    });

    // ── Toggle handler ────────────────────────────────────────────────────────
    header.addEventListener('click', () => {
      const nowOpen = body.classList.toggle('model-group-body--open');
      header.setAttribute('aria-expanded', String(nowOpen));
      if (nowOpen) {
        collapsed.delete(backend);
      } else {
        collapsed.add(backend);
      }
      saveCollapsedGroups(collapsed);
    });

    groupEl.appendChild(header);
    groupEl.appendChild(body);
    container.appendChild(groupEl);
  });

  return selected;
}

function refreshGroupCounter(header, group, selected) {
  const count = group.filter(m => selected.has(m.id)).length;
  let sel = header.querySelector('.model-group-sel');
  if (count > 0) {
    if (!sel) {
      sel = document.createElement('span');
      sel.className = 'model-group-sel';
      // insert before the chevron
      header.insertBefore(sel, header.querySelector('.toggle-chevron'));
    }
    sel.textContent = `${count} selected`;
  } else if (sel) {
    sel.remove();
  }
}

function loadCollapsedGroups() {
  try {
    const raw = localStorage.getItem(KEY_MODEL_GROUPS);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveCollapsedGroups(set) {
  localStorage.setItem(KEY_MODEL_GROUPS, JSON.stringify([...set]));
}

// ─── PRESET BUTTONS ───────────────────────────────────────────────────────────

export function renderPresets(presets, container, textarea) {
  container.innerHTML = '';
  Object.entries(presets).forEach(([label, text]) => {
    const btn = document.createElement('button');
    btn.className   = 'preset-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => { textarea.value = text; });
    container.appendChild(btn);
  });
}

// ─── RESULT CARDS ─────────────────────────────────────────────────────────────

export function insertLoadingCard(model, grid) {
  const card     = document.createElement('div');
  card.className = 'result-card';
  card.id        = `card-${model.id}`;
  card.innerHTML = `
    <div class="card-header" style="--card-accent: ${model.color};">
      <span class="card-model-name">${model.label}</span>
      <div class="card-badges">
        <span class="badge badge-${model.backend}">${model.backend}</span>
      </div>
    </div>
    <div class="card-loading">
      <div class="spinner"></div>
      <span>Waiting for response…</span>
    </div>
    <div class="card-footer">
      <span class="card-footer-stat">latency: <span>—</span></span>
      <span class="card-footer-stat">tokens: <span>—</span></span>
    </div>
  `;
  grid.appendChild(card);
}

export function updateCard(modelId, result) {
  const card = document.getElementById(`card-${modelId}`);
  if (!card) return;

  const m      = result.model;
  const accent = m.color ?? '#6c8bff';
  const latSec = msToSec(result.elapsed);

  const bodyHtml = result.status === 'ok'
    ? `<pre><code class="language-python">${escapeHtml(result.text)}</code></pre>`
    : `<div class="card-error">✗ ${escapeHtml(result.error)}</div>`;

  if (result.status === 'error') card.classList.add('error-card');

  card.innerHTML = `
    <div class="card-header" style="--card-accent: ${accent};">
      <span class="card-model-name">${m.label}</span>
      <div class="card-badges">
        <span class="badge badge-${m.backend}">${m.backend}</span>
        <span class="badge badge-time">${latSec}</span>
        ${result.status === 'ok'
          ? `<span class="badge badge-tokens">${result.tokens} tok</span>`
          : `<span class="badge badge-error">error</span>`}
      </div>
    </div>
    <div class="card-body">${bodyHtml}</div>
    <div class="card-footer">
      <span class="card-footer-stat">latency: <span>${latSec}</span></span>
      <span class="card-footer-stat">out: <span>${result.status === 'ok' ? result.tokens + ' tok' : '—'}</span></span>
      ${result.status === 'ok' && result.promptTokens
        ? `<span class="card-footer-stat">in: <span>${result.promptTokens} tok</span></span>`
        : ''}
      ${result.status === 'ok'
        ? `<button class="copy-btn" data-model-id="${modelId}">Copy</button>`
        : ''}
    </div>
  `;

  // Syntax highlight
  if (result.status === 'ok' && typeof hljs !== 'undefined') {
    requestAnimationFrame(() => {
      const codeEl = card.querySelector('code');
      if (codeEl) hljs.highlightElement(codeEl);
    });
  }

  card.querySelector('.copy-btn')?.addEventListener('click', () =>
    copyToClipboard(result.text, card.querySelector('.copy-btn'))
  );
}

export function markWinner(modelId) {
  const card = document.getElementById(`card-${modelId}`);
  if (!card) return;
  card.classList.add('winner');
  const badges = card.querySelector('.card-badges');
  if (badges) {
    const badge = document.createElement('span');
    badge.className   = 'badge badge-winner';
    badge.textContent = 'fastest';
    badges.prepend(badge);
  }
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

/** Show the empty state placeholder (before any run). */
export function showEmptyState() {
  document.getElementById('emptyState').classList.remove('hidden');
}

/** Hide the empty state placeholder. */
export function hideEmptyState() {
  document.getElementById('emptyState').classList.add('hidden');
}

// ─── SUMMARY METRICS ─────────────────────────────────────────────────────────

/**
 * Populate and reveal the summary metric cards.
 * @param {{ total, success, failed, fastest, avgElapsed, avgTokens }} stats
 */
export function renderSummary(stats) {
  document.getElementById('summarySection').classList.remove('hidden');
  document.getElementById('metricModels').textContent       = stats.total;
  document.getElementById('metricSuccess').textContent      = `${stats.success} success · ${stats.failed} failed`;
  document.getElementById('metricFastest').textContent      = msToSec(stats.fastest.elapsed);
  document.getElementById('metricFastestModel').textContent = stats.fastest.model.label;
  document.getElementById('metricAvg').textContent          = msToSec(stats.avgElapsed);
  // Best throughput
  const bestTps = stats.bestTps.tokens / (stats.bestTps.elapsed / 1000);
  document.getElementById('metricTps').textContent          = bestTps.toFixed(1) + ' tok/s';
  document.getElementById('metricTpsModel').textContent     = stats.bestTps.model.label;
  // Avg total tokens (prompt + completion)
  document.getElementById('metricTokens').textContent       = stats.avgTotalTokens ?? stats.avgTokens;
}

export function hideSummary() {
  document.getElementById('summarySection').classList.add('hidden');
}

// ─── OLLAMA STATUS INDICATOR ─────────────────────────────────────────────────

export function setOllamaStatus(state, detail = '') {
  const pill  = document.getElementById('ollamaStatusPill');
  const label = document.getElementById('ollamaStatusLabel');
  const sub   = document.getElementById('ollamaStatusSub');
  if (!pill) return;

  // Remove all state classes, add the new one
  pill.className = `ollama-status-pill ollama-status-${state}`;

  const labels = {
    unknown:  'Unknown',
    checking: 'Checking…',
    starting: 'Starting…',
    running:  'Running',
    stopped:  'Not running',
    error:    'Error',
  };

  label.textContent = labels[state] ?? state;
  if (sub) sub.textContent = detail;
}

// ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

function escapeHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}
