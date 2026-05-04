/**
 * ollama.js
 *
 * Browser-side Ollama lifecycle + model-discovery helpers.
 *
 * Server routes consumed here:
 *   GET  /api/ollama/health  →  { running: bool, models: string[] }
 *   GET  /api/ollama/models  →  { models: OllamaModel[] }
 *   POST /api/ollama/start   →  starts ollama serve, polls until ready
 */

// How long to wait before declaring Ollama unreachable (ms)
const START_TIMEOUT_MS  = 20_000;
// How often to re-check while waiting for Ollama to boot (ms)
const POLL_INTERVAL_MS  =    800;

// ─── HEALTH ───────────────────────────────────────────────────────────────────

/**
 * Ping the server's health route.
 * @returns {Promise<{ running: boolean, models?: string[] }>}
 */
export async function checkHealth() {
  try {
    const res = await fetch('/api/ollama/health', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { running: false };
    return res.json();
  } catch {
    return { running: false };
  }
}

// ─── MODEL DISCOVERY ─────────────────────────────────────────────────────────

/**
 * Fetch the list of locally installed Ollama models from the server.
 *
 * Returns an array of model descriptors ready to merge into the full model list:
 *   { id, label, family, parameterSize, sizeGb }
 *
 * Throws if Ollama is not running or the request fails.
 *
 * @returns {Promise<Array<{ id: string, label: string, family: string,
 *                           parameterSize: string, sizeGb: string|null }>>}
 */
export async function fetchOllamaModels() {
  const res = await fetch('/api/ollama/models', { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch model list (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data.models ?? [];
}

// ─── AUTO-START ───────────────────────────────────────────────────────────────

/**
 * Ask server.js to start `ollama serve` and block until it is ready.
 * @returns {Promise<{ running: boolean, models?: string[] }>}
 */
export async function requestStart() {
  const res = await fetch('/api/ollama/start', {
    method: 'POST',
    // Give the server time to boot Ollama (up to START_TIMEOUT_MS + buffer)
    signal: AbortSignal.timeout(START_TIMEOUT_MS + 5_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Server returned HTTP ${res.status} when starting Ollama.`);
  }

  return res.json();
}

/**
 * Ensure Ollama is running. If it isn't, auto-start it via the server.
 * Calls onStatusUpdate(msg) with human-readable progress strings.
 *
 * @param {(msg: string) => void} onStatusUpdate
 * @returns {Promise<{ running: boolean, models?: string[] }>}
 */
export async function ensureOllamaRunning(onStatusUpdate = () => {}) {
  onStatusUpdate('Checking Ollama…');

  const health = await checkHealth();
  if (health.running) {
    onStatusUpdate('Ollama is running.');
    return health;
  }

  onStatusUpdate('Ollama is not running. Starting it now…');

  try {
    const result = await requestStart();
    onStatusUpdate('Ollama started successfully.');
    return result;
  } catch (err) {
    throw new Error(
      `Could not start Ollama automatically: ${err.message}\n` +
      `Try running "ollama serve" manually in a terminal.`
    );
  }
}

// ─── POLLING ─────────────────────────────────────────────────────────────────

/**
 * Poll health continuously until Ollama is up or the timeout expires.
 * @param {(health: object) => void} onUpdate
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function pollUntilReady(onUpdate, timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await checkHealth();
    onUpdate(health);
    if (health.running) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
