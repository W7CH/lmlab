/**
 * ui.js
 *
 * Pure DOM-manipulation helpers.
 * No fetch, no state — just building and updating elements.
 */

// ─── STATUS BAR ───────────────────────────────────────────────────────────────

/**
 * Update the status bar at the top of the content area.
 * @param {'idle'|'running'|'done'|'error'} type
 * @param {string} message
 */
export function setStatus(type, message) {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className    = `status-dot ${type}`;
  text.textContent = message;
}

// ─── MODEL TOGGLE LIST ────────────────────────────────────────────────────────

/**
 * Show a transient loading / error state inside the model list container.
 * Replaced by renderModelList() once data arrives.
 *
 * @param {'loading'|'error'} state
 * @param {string} [message]
 */
export function setModelListState(state, message = '') {
  const container = document.getElementById('modelList');
  if (!container) return;

  if (state === 'loading') {
    // Render skeleton rows that match the height of real model items
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
 * Render the model toggle list.
 * Returns a Set<string> of active model IDs — mutated on click.
 *
 * Each model item shows:
 *   • A colored indicator dot (uses model.color)
 *   • The model label
 *   • Backend badge (ollama / gemini)
 *   • Size badge if available (e.g. "3.8 GB")
 *
 * @param {Array}       models
 * @param {HTMLElement} container
 * @returns {Set<string>}
 */
export function renderModelList(models, container) {
  const selected = new Set(models.filter(m => m.active).map(m => m.id));

  container.innerHTML = '';

  if (models.length === 0) {
    container.innerHTML = `
      <div class="model-list-empty">No models found. Run <code>ollama pull &lt;model&gt;</code> to install one.</div>
    `;
    return selected;
  }

  models.forEach(m => {
    const item = document.createElement('div');
    item.className  = `model-item${selected.has(m.id) ? ' active' : ''}`;
    item.dataset.id = m.id;

    // Size badge — only for Ollama models that have size info
    const sizeBadge = m.meta?.sizeGb
      ? `<span class="model-size">${m.meta.sizeGb} GB</span>`
      : '';

    item.innerHTML = `
      <div class="model-dot" style="--model-color: ${m.color};"></div>
      <span class="model-name" title="${m.id}">${m.label}</span>
      ${sizeBadge}
      <span class="model-backend">${m.backend}</span>
    `;

    item.addEventListener('click', () => {
      if (selected.has(m.id)) {
        selected.delete(m.id);
        item.classList.remove('active');
      } else {
        selected.add(m.id);
        item.classList.add('active');
      }
    });

    container.appendChild(item);
  });

  return selected;
}

// ─── PRESET BUTTONS ───────────────────────────────────────────────────────────

/**
 * Render preset-prompt buttons inside the prompt box footer.
 * @param {Record<string,string>} presets
 * @param {HTMLElement}           container
 * @param {HTMLTextAreaElement}   textarea
 */
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

/**
 * Insert a loading-state placeholder card.
 * @param {{ id: string, label: string, backend: string, color: string }} model
 * @param {HTMLElement} grid
 */
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

/**
 * Replace a loading card with the completed result.
 * @param {string} modelId
 * @param {{ status, text?, tokens?, elapsed, error?, model }} result
 */
export function updateCard(modelId, result) {
  const card = document.getElementById(`card-${modelId}`);
  if (!card) return;

  const m       = result.model;
  const accent  = m.color ?? '#6c8bff';

  const bodyHtml = result.status === 'ok'
    ? `<pre><code class="language-python">${escapeHtml(result.text)}</code></pre>`
    : `<div class="card-error">✗ ${escapeHtml(result.error)}</div>`;

  if (result.status === 'error') card.classList.add('error-card');

  card.innerHTML = `
    <div class="card-header" style="--card-accent: ${accent};">
      <span class="card-model-name">${m.label}</span>
      <div class="card-badges">
        <span class="badge badge-${m.backend}">${m.backend}</span>
        <span class="badge badge-time">${result.elapsed}ms</span>
        ${result.status === 'ok'
          ? `<span class="badge badge-tokens">${result.tokens} tok</span>`
          : `<span class="badge badge-error">error</span>`}
      </div>
    </div>
    <div class="card-body">${bodyHtml}</div>
    <div class="card-footer">
      <span class="card-footer-stat">latency: <span>${result.elapsed}ms</span></span>
      <span class="card-footer-stat">tokens: <span>${result.status === 'ok' ? result.tokens : '—'}</span></span>
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

/**
 * Add the "fastest" winner badge to a card and highlight its border.
 * @param {string} modelId
 */
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
 * @param {{ total, success, failed, fastest, avgLatency, avgTokens }} stats
 */
export function renderSummary(stats) {
  document.getElementById('summarySection').classList.remove('hidden');
  document.getElementById('metricModels').textContent       = stats.total;
  document.getElementById('metricSuccess').textContent      = `${stats.success} success · ${stats.failed} failed`;
  document.getElementById('metricFastest').textContent      = `${stats.fastest.elapsed}ms`;
  document.getElementById('metricFastestModel').textContent = stats.fastest.model.label;
  document.getElementById('metricAvg').textContent          = `${stats.avgLatency}ms`;
  document.getElementById('metricTokens').textContent       = stats.avgTokens;
}

/** Hide the summary section (reset before a new run). */
export function hideSummary() {
  document.getElementById('summarySection').classList.add('hidden');
}

// ─── OLLAMA STATUS INDICATOR ─────────────────────────────────────────────────

/**
 * Update the Ollama status pill in the sidebar.
 * @param {'unknown'|'checking'|'running'|'stopped'|'error'} state
 * @param {string} [detail]  — optional extra text (e.g. model count or error)
 */
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
