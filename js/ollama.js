/**
 * ollama.js
 *
 * Browser-side Ollama lifecycle helpers.
 *
 * All real work (process spawning, port polling) happens in server.js.
 * This module is a thin client that talks to server.js's two API routes:
 *
 *   GET  /api/ollama/health  →  { running: bool, models: string[] }
 *   POST /api/ollama/start   →  starts ollama serve, polls until ready,
 *                                then returns the same health shape
 *
 * The three exported functions are called from eval.js in sequence:
 *   1. checkHealth()       — fast ping, used on page load + before every run
 *   2. requestStart()      — ask the server to spawn `ollama serve`
 *   3. waitUntilReady()    — poll health until Ollama responds or we time out
 */

// How long to wait before declaring Ollama unreachable (ms)
const START_TIMEOUT_MS  = 20_000;
// How often to re-check while waiting for Ollama to boot (ms)
const POLL_INTERVAL_MS  =    800;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Ping the server's health route.
 * @returns {Promise<{ running: boolean, models?: string[] }>}
 */
export async function checkHealth() {
  try {
    const res = await fetch('/api/ollama/health', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { running: false };
    return res.json();
  } catch {
    return { running: false };
  }
}

/**
 * Ask server.js to start `ollama serve` and wait until it is ready.
 * The server does the polling; this just awaits its response.
 *
 * @returns {Promise<{ running: boolean, models?: string[] }>}
 * @throws  {Error} if the server reports a start failure
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
 * Ensure Ollama is running before a run:
 *   1. Check health — if already up, return immediately.
 *   2. If down, call requestStart() which blocks until Ollama is ready.
 *   3. If start fails or times out, throw with a user-friendly message.
 *
 * @param {function(string): void} onStatusUpdate  — callback for live status messages
 * @returns {Promise<{ running: boolean, models: string[] }>}
 */
export async function ensureOllamaRunning(onStatusUpdate = () => {}) {
  onStatusUpdate('Checking Ollama…');

  const health = await checkHealth();
  if (health.running) {
    onStatusUpdate('Ollama is running.');
    return health;
  }

  // Not running — ask the server to start it
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

/**
 * Continuously poll health until Ollama is up or the timeout expires.
 * Used by the sidebar status indicator for live feedback.
 *
 * @param {function({ running: boolean, models?: string[] }): void} onUpdate
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}  resolves true if Ollama came up, false on timeout
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
