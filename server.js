/**
 * server.js  —  Dev server + Ollama lifecycle manager
 *
 * Run with:  node server.js
 *
 * Routes:
 *   GET  /api/ollama/health  →  { running: bool, models: string[] }
 *   GET  /api/ollama/models  →  { models: OllamaModel[] }   ← NEW
 *   POST /api/ollama/start   →  spawns `ollama serve` if not already up
 *   /v1/*                    →  proxied to Ollama (no CORS issues in the browser)
 *   everything else          →  static file server
 *
 * No npm install required — uses only Node.js built-in modules.
 *
 * Requirements:
 *   - Node.js 18+
 *   - `ollama` on PATH
 */

import http             from 'node:http';
import https            from 'node:https';
import fs               from 'node:fs';
import path             from 'node:path';
import { spawn }        from 'node:child_process';
import { URL }          from 'node:url';

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const PORT        = 8080;
const OLLAMA_BASE    = 'http://127.0.0.1:11434';
const ANTHROPIC_API  = 'https://api.anthropic.com';
const ANTHROPIC_VER  = '2023-06-01';

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
 * @returns {{ running: boolean, models?: string[] }}
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

// ─── MODEL LIST ───────────────────────────────────────────────────────────────

/**
 * Fetch the full model list from Ollama's /api/tags endpoint.
 *
 * Each model entry from Ollama looks like:
 *   { name, model, modified_at, size, digest, details: { family, parameter_size, ... } }
 *
 * We return a cleaned-up shape the browser can use directly:
 *   { id, label, family, parameterSize, sizeGb }
 *
 * @returns {{ models: Array<{ id, label, family, parameterSize, sizeGb }> }}
 */
async function listOllamaModels() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Ollama /api/tags returned HTTP ${res.status}`);

  const data = await res.json();
  const raw  = data.models ?? [];

  const models = raw.map(m => {
    // name is e.g. "llama3.2:latest" or "llama3.2:3b"
    const id           = m.name;
    const baseName     = id.split(':')[0];                           // "llama3.2"
    const tag          = id.includes(':') ? id.split(':')[1] : '';  // "latest"
    const family       = m.details?.family ?? baseName;
    const paramSize    = m.details?.parameter_size ?? '';
    const sizeGb       = m.size ? (m.size / 1e9).toFixed(1) : null;

    // Build a human-friendly label: "Llama 3.2" or "Llama 3.2 · 3B"
    const friendlyBase = baseName
      .replace(/([a-z])(\d)/g,  '$1 $2')   // "llama3" → "llama 3"
      .replace(/(\d)([a-z])/gi, '$1 $2')   // "3b" → "3 b"  (handled below)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();

    const tagSuffix = tag && tag !== 'latest'
      ? ` · ${tag.toUpperCase()}`
      : (paramSize ? ` · ${paramSize}` : '');

    const label = friendlyBase + tagSuffix;

    return { id, label, family, parameterSize: paramSize, sizeGb };
  });

  // Sort alphabetically by label
  models.sort((a, b) => a.label.localeCompare(b.label));

  return { models };
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
  const target    = new URL(`${OLLAMA_BASE}${req.url}`);
  const isHttps   = target.protocol === 'https:';
  const transport = isHttps ? https : http;

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

// ─── ANTHROPIC PROXY ─────────────────────────────────────────────────────────

/**
 * Proxy POST /api/anthropic/messages → https://api.anthropic.com/v1/messages
 *
 * Why a proxy? The Anthropic API sets Access-Control-Allow-Origin: * only for
 * specific origins; direct browser calls are blocked by CORS in most setups.
 * We receive the apiKey in the request body, forward it as x-api-key, and
 * never log it.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 */
async function proxyToAnthropic(req, res) {
  // Collect the full request body
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse(res, 400, { error: 'Invalid JSON body' });
  }

  // Pull the key out of the body — do NOT forward it back to the client
  const { apiKey, ...anthropicBody } = payload;
  if (!apiKey) {
    return jsonResponse(res, 400, { error: 'apiKey is required in request body' });
  }

  const upstream = await fetch(`${ANTHROPIC_API}/v1/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': ANTHROPIC_VER,
    },
    body: JSON.stringify(anthropicBody),
  });

  const upstreamText = await upstream.text();

  res.writeHead(upstream.status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(upstreamText);
}

// ─── STATIC FILE SERVER ───────────────────────────────────────────────────────

const ROOT = path.resolve('.');   // serve from the project root

async function serveStatic(req, res) {
  // Strip query string before resolving to a file path (e.g. /viewer.html?data=… → viewer.html)
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

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

  // CORS pre-flight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // GET /api/ollama/health
  if (method === 'GET' && url === '/api/ollama/health') {
    const health = await checkOllamaHealth();
    return jsonResponse(res, 200, health);
  }

  // GET /api/ollama/models
  if (method === 'GET' && url === '/api/ollama/models') {
    try {
      const result = await listOllamaModels();
      return jsonResponse(res, 200, result);
    } catch (err) {
      return jsonResponse(res, 503, { error: err.message });
    }
  }

  // POST /api/ollama/start
  if (method === 'POST' && url === '/api/ollama/start') {
    try {
      const health = await startOllama();
      return jsonResponse(res, 200, health);
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  // POST /api/anthropic/messages  (Anthropic proxy)
  if (method === 'POST' && url === '/api/anthropic/messages') {
    return proxyToAnthropic(req, res);
  }

  // Proxy /v1/* → Ollama
  if (url.startsWith('/v1/')) {
    return proxyToOllama(req, res);
  }

  // Static files
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
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}
