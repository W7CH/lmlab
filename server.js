/**
 * server.js  —  Dev server + Ollama lifecycle manager
 *
 * Replaces the plain `python3 -m http.server` from v1.
 * Run with:  node server.js
 *
 * What it does:
 *   1. Serves all static files (index.html, css/, js/) from this directory
 *   2. Exposes two API routes the browser calls before evaluation:
 *        GET  /api/ollama/health  →  { running: bool, models: string[] }
 *        POST /api/ollama/start   →  spawns `ollama serve` if not already up
 *   3. Proxies /v1/* to Ollama (avoids CORS issues in the browser)
 *
 * No npm install required — uses only Node.js built-in modules.
 *
 * Requirements:
 *   - Node.js 18+  (uses native fetch + fs/promises)
 *   - `ollama` must be on PATH  (brew install ollama / https://ollama.com)
 */

import http       from 'node:http';
import https      from 'node:https';
import fs         from 'node:fs';
import path       from 'node:path';
import { spawn }  from 'node:child_process';
import { URL }    from 'node:url';

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const PORT        = 8080;
const OLLAMA_BASE = 'http://127.0.0.1:11434';

// MIME types for static file serving
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// ─── OLLAMA PROCESS HANDLE ────────────────────────────────────────────────────

/** Holds the child_process if we spawned ollama serve ourselves. */
let ollamaProcess = null;

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

/**
 * Ping Ollama's /api/tags endpoint (the lightest available health check).
 * Returns { running: true, models: ['llama3.2', ...] }  or  { running: false }
 */
async function checkOllamaHealth() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { running: false };
    const data = await res.json();
    const models = (data.models ?? []).map(m => m.name);
    return { running: true, models };
  } catch {
    return { running: false };
  }
}

// ─── AUTO-START ───────────────────────────────────────────────────────────────

/**
 * Spawn `ollama serve` as a background child process.
 * Resolves once Ollama responds to health checks (max 15 s).
 * Rejects with a descriptive error if it fails to start in time.
 */
async function startOllama() {
  // Maybe it started between the health check and this call
  const already = await checkOllamaHealth();
  if (already.running) return already;

  console.log('[server] Starting ollama serve…');

  ollamaProcess = spawn('ollama', ['serve'], {
    detached: false,
    stdio:    ['ignore', 'pipe', 'pipe'],
  });

  ollamaProcess.stdout.on('data', d => process.stdout.write(`[ollama] ${d}`));
  ollamaProcess.stderr.on('data', d => process.stderr.write(`[ollama] ${d}`));

  ollamaProcess.on('error', err => {
    console.error('[server] Failed to spawn ollama:', err.message);
    console.error('[server] Make sure `ollama` is installed and on your PATH.');
  });

  ollamaProcess.on('exit', (code, signal) => {
    console.log(`[ollama] exited — code=${code} signal=${signal}`);
    ollamaProcess = null;
  });

  // Poll until healthy (max 15 seconds, 500 ms intervals)
  const TIMEOUT  = 15_000;
  const INTERVAL =    500;
  const deadline = Date.now() + TIMEOUT;

  while (Date.now() < deadline) {
    await sleep(INTERVAL);
    const health = await checkOllamaHealth();
    if (health.running) {
      console.log('[server] Ollama is up.');
      return health;
    }
  }

  throw new Error(`Ollama did not become ready within ${TIMEOUT / 1000}s. Check that it is installed correctly.`);
}

// ─── OLLAMA PROXY ─────────────────────────────────────────────────────────────

/**
 * Transparently forward a /v1/* request to Ollama and pipe the response back.
 * This eliminates all CORS issues — the browser only ever talks to our server.
 */
function proxyToOllama(req, res) {
  const target     = new URL(`${OLLAMA_BASE}${req.url}`);
  const isHttps    = target.protocol === 'https:';
  const transport  = isHttps ? https : http;

  const options = {
    hostname: target.hostname,
    port:     target.port || (isHttps ? 443 : 80),
    path:     target.pathname + target.search,
    method:   req.method,
    headers:  { ...req.headers, host: target.host },
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] Error forwarding to Ollama:', err.message);
    jsonResponse(res, 502, { error: `Proxy error: ${err.message}` });
  });

  req.pipe(proxyReq);
}

// ─── STATIC FILE SERVER ───────────────────────────────────────────────────────

const ROOT = path.resolve('.');   // serve from the project root

async function serveStatic(req, res) {
  // Resolve URL to a file path; default to index.html
  let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    return jsonResponse(res, 403, { error: 'Forbidden' });
  }

  // Append index.html for directory paths
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  try {
    const content = await fs.promises.readFile(filePath);
    const ext     = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // ── CORS pre-flight ───────────────────────────────────────────────────────
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // ── API: health check ─────────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/ollama/health') {
    const health = await checkOllamaHealth();
    return jsonResponse(res, 200, health);
  }

  // ── API: start Ollama ─────────────────────────────────────────────────────
  if (method === 'POST' && url === '/api/ollama/start') {
    try {
      const health = await startOllama();
      return jsonResponse(res, 200, health);
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  // ── Proxy: forward /v1/* to Ollama ────────────────────────────────────────
  if (url.startsWith('/v1/')) {
    return proxyToOllama(req, res);
  }

  // ── Static files ──────────────────────────────────────────────────────────
  await serveStatic(req, res);
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n[server] Shutting down…');
  if (ollamaProcess) {
    console.log('[server] Stopping ollama serve…');
    ollamaProcess.kill('SIGTERM');
  }
  server.close(() => process.exit(0));
}

// ─── START ────────────────────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  LMLab`);
  console.log(`  ──────────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Ollama:  ${OLLAMA_BASE}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);
});

// ─── UTILS ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
  });
  res.end(payload);
}
