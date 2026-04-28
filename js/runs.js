/**
 * runs.js
 *
 * Local-first run persistence — all reads/writes go to localStorage.
 * No backend, no authentication, no compression (plain JSON).
 *
 * Storage schema:
 *   localStorage key: "lmlab_runs"
 *   Value: JSON array of RunRecord[], newest first.
 *
 * RunRecord shape:
 *   {
 *     id:        string,       // timestamp-based unique id, e.g. "run_1712345678901"
 *     title:     string,       // auto-generated from prompt, user can rename
 *     createdAt: number,       // Date.now() at save time
 *     prompt:    string,
 *     params:    { temperature, maxTokens },
 *     results:   Result[],     // same shape as share.js payload results
 *   }
 */

const STORAGE_KEY = 'lmlab_runs';
const MAX_RUNS    = 50;

// ─── PUBLIC CRUD ──────────────────────────────────────────────────────────────

/**
 * Save a new run. Prepends to the list (newest first).
 * Trims to MAX_RUNS. Returns the saved RunRecord.
 *
 * @param {{ prompt, params, results }} snapshot  — same shape storeRun() receives
 * @param {string} [customTitle]
 * @returns {RunRecord}
 */
export function saveRun(snapshot, customTitle) {
  const { prompt, systemPrompt, params, results } = snapshot;

  const id        = `run_${Date.now()}`;
  const createdAt = Date.now();
  const title     = customTitle || autoTitle(prompt, results);

  const record = {
    id,
    title,
    createdAt,
    prompt,
    systemPrompt: systemPrompt ?? '',
    params,
    results: results.map(r => ({
      model: {
        id:      r.model.id,
        label:   r.model.label,
        backend: r.model.backend,
        color:   r.model.color,
      },
      status:      r.status,
      elapsed:     r.elapsed,
      // ok fields
      text:         r.text        ?? null,
      tokens:       r.tokens      ?? null,
      promptTokens: r.promptTokens ?? 0,
      totalTokens:  r.totalTokens ?? r.tokens ?? null,
      sizeVramMb:   r.sizeVramMb  ?? null,
      totalSizeMb:  r.totalSizeMb ?? null,
      // error field
      error: r.error ?? null,
    })),
  };

  const runs = loadAllRuns();
  runs.unshift(record);                           // newest first
  if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
  persist(runs);

  return record;
}

/**
 * Return all saved runs (newest first).
 * @returns {RunRecord[]}
 */
export function loadAllRuns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Return a single run by id, or null.
 * @param {string} id
 * @returns {RunRecord|null}
 */
export function getRunById(id) {
  return loadAllRuns().find(r => r.id === id) ?? null;
}

/**
 * Delete a run by id. No-op if not found.
 * @param {string} id
 */
export function deleteRun(id) {
  persist(loadAllRuns().filter(r => r.id !== id));
}

/**
 * Rename a run. No-op if not found.
 * @param {string} id
 * @param {string} newTitle
 */
export function renameRun(id, newTitle) {
  const runs = loadAllRuns().map(r =>
    r.id === id ? { ...r, title: newTitle.trim() || r.title } : r
  );
  persist(runs);
}

/**
 * Export a run as a pretty-printed JSON file download.
 * @param {string} id
 */
export function exportRunJson(id) {
  const run = getRunById(id);
  if (!run) return;

  const json = JSON.stringify(run, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `${slugify(run.title)}_${run.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PRIVATE ─────────────────────────────────────────────────────────────────

function persist(runs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch (e) {
    // localStorage full — remove oldest run and retry once
    if (runs.length > 1) {
      runs.pop();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(runs)); } catch { /* give up */ }
    }
  }
}

/**
 * Generate a human-readable title from the prompt and results.
 * Examples: "Palindrome check · 3 models"  "REST API · llama3.2, gpt-4o"
 */
function autoTitle(prompt, results) {
  // Use the first sentence / up to 40 chars of the prompt
  const snippet = prompt.replace(/\s+/g, ' ').trim().slice(0, 40).replace(/\.$/, '');
  const models  = results
    .map(r => r.model?.label ?? r.model?.id ?? '')
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return models ? `${snippet} · ${models}` : snippet;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
