/**
 * share.js
 *
 * Serialises a completed evaluation run into a compressed, URL-safe string
 * and generates a shareable /viewer.html link.
 *
 * Compression : LZ-string (loaded via CDN as window.LZString)
 * Encoding    : compressToEncodedURIComponent — already URL-safe, no extra step needed
 */

const VIEWER_BASE = 'https://w7ch.github.io/lmlab/viewer.html';

// ─── PAYLOAD ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal, serialisable snapshot of a completed run.
 *
 * @param {string} promptText
 * @param {number} temperature
 * @param {number} maxTokens
 * @param {Object} resultsMap   – keyed by model id, values from eval.js
 * @returns {Object}
 */
export function buildSharePayload(promptText, systemPrompt, temperature, maxTokens, resultsMap) {
  const results = Object.values(resultsMap).map(r => {
    const entry = {
      id:      r.model.id,
      label:   r.model.label,
      backend: r.model.backend,
      color:   r.model.color,
      status:  r.status,
      elapsed: r.elapsed,
    };
    if (r.status === 'ok') {
      entry.text         = r.text;
      entry.tokens       = r.tokens;
      entry.promptTokens = r.promptTokens ?? 0;
      entry.totalTokens  = r.totalTokens  ?? ((r.tokens ?? 0) + (r.promptTokens ?? 0));
      entry.chars        = r.chars        ?? r.text.length;
    } else {
      entry.error = r.error ?? 'Unknown error';
    }
    return entry;
  });

  return { v: 2, ts: Date.now(), prompt: promptText, systemPrompt: systemPrompt ?? '', temperature, maxTokens, results };
}

// ─── URL GENERATION ───────────────────────────────────────────────────────────

/**
 * Compress a payload object to a full viewer URL.
 * Depends on window.LZString being available (loaded via CDN script tag).
 *
 * @param {Object} payload
 * @returns {string}
 */
function generateShareUrl(payload) {
  if (typeof LZString === 'undefined') {
    throw new Error('LZString library is not loaded — check the CDN script tag in index.html.');
  }
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  return `${VIEWER_BASE}?data=${compressed}`;
}

// ─── BUTTON ───────────────────────────────────────────────────────────────────

/**
 * Inject (or replace) a Share button into the #summarySection .section-header.
 * Called by eval.js once a run completes.
 *
 * @param {string} promptText
 * @param {number} temperature
 * @param {number} maxTokens
 * @param {Object} resultsMap
 */
export function showShareButton(promptText, systemPrompt, temperature, maxTokens, resultsMap) {
  document.getElementById('shareBtn')?.remove();

  const header = document.querySelector('#summarySection .section-header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.id        = 'shareBtn';
  btn.className = 'share-btn';
  btn.innerHTML = '<span class="share-icon" aria-hidden="true">↗</span>Share';

  btn.addEventListener('click', () => {
    let url;
    try {
      url = generateShareUrl(buildSharePayload(promptText, systemPrompt, temperature, maxTokens, resultsMap));
    } catch {
      flash(btn, '✗ Error', 2000, null);
      return;
    }

    navigator.clipboard.writeText(url).then(() => {
      flash(btn, '✓ Copied!', 2500, 'share-btn--copied');
    }).catch(() => {
      // Clipboard API unavailable (e.g. non-HTTPS) — surface URL to the user
      window.prompt('Copy this shareable link:', url);
    });
  });

  // Insert immediately after <h2> so the button sits next to "Run Summary"
  const h2 = header.querySelector('h2');
  if (h2) h2.insertAdjacentElement('afterend', btn);
  else     header.appendChild(btn);
}

// ─── INTERNAL ─────────────────────────────────────────────────────────────────

function flash(btn, message, duration, cssClass) {
  const original = btn.innerHTML;
  btn.textContent = message;
  btn.disabled    = true;
  if (cssClass) btn.classList.add(cssClass);
  setTimeout(() => {
    btn.innerHTML = original;
    btn.disabled  = false;
    if (cssClass) btn.classList.remove(cssClass);
  }, duration);
}
