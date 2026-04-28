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

// Compressed ?data= length thresholds.
// GitHub Pages / Fastly rejects request lines above ~8 KB; CDN limits aside,
// browsers start choking past 2 MB. We fall back to a compact payload (trimmed
// response text) before that limit, and error out if even compact is too large.
const SHARE_SOFT_LIMIT  = 200_000;  // chars — try compact payload
const SHARE_HARD_LIMIT  = 1_500_000; // chars — refuse entirely
const COMPACT_TEXT_CHARS = 2_000;    // chars to keep per response in compact mode

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
 * Compress a payload to a viewer URL, falling back to a compact version when
 * the full payload would exceed safe URL-length limits.
 *
 * @param {Object} payload
 * @returns {{ url: string, truncated: boolean }}
 * @throws {Error} when even the compact payload exceeds SHARE_HARD_LIMIT
 */
function generateShareUrl(payload) {
  if (typeof LZString === 'undefined') {
    throw new Error('LZString library is not loaded — check the CDN script tag in index.html.');
  }

  const compress = p => LZString.compressToEncodedURIComponent(JSON.stringify(p));

  const full = compress(payload);
  if (full.length <= SHARE_SOFT_LIMIT) {
    return { url: `${VIEWER_BASE}?data=${full}`, truncated: false };
  }

  // Full payload is too large — rebuild with trimmed response text.
  const compact = {
    ...payload,
    results: payload.results.map(r => {
      if (r.text && r.text.length > COMPACT_TEXT_CHARS) {
        return { ...r, text: r.text.slice(0, COMPACT_TEXT_CHARS) + '\n\n[Truncated — response was too long to share in full]' };
      }
      return r;
    }),
  };

  const compactStr = compress(compact);
  if (compactStr.length > SHARE_HARD_LIMIT) {
    const mb = (compactStr.length / 1_000_000).toFixed(1);
    throw new Error(`Payload too large to share (${mb} MB even after truncation). Try fewer models.`);
  }

  return { url: `${VIEWER_BASE}?data=${compactStr}`, truncated: true };
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
    let result;
    try {
      result = generateShareUrl(buildSharePayload(promptText, systemPrompt, temperature, maxTokens, resultsMap));
    } catch (err) {
      flash(btn, '✗ Too large', 3000, null);
      btn.title = err.message;
      return;
    }

    const { url, truncated } = result;

    navigator.clipboard.writeText(url).then(() => {
      flash(btn,
        truncated ? '✓ Copied (truncated)' : '✓ Copied!',
        truncated ? 3500 : 2500,
        'share-btn--copied',
      );
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
