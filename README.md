<div align="center">

![LMLab Banner](https://capsule-render.vercel.app/api?type=blur&height=280&color=gradient&customColorList=12,20,24&text=LMLab&fontColor=Black&fontSize=80&fontAlignY=50&animation=twinkling)

<br/>

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/npm_install-not_required-success?style=for-the-badge&logo=npm&logoColor=white)](https://docs.npmjs.com/about-npm)
[![Backends](https://img.shields.io/badge/Backends-7_providers-blueviolet?style=for-the-badge)](https://ollama.com/)

<br/>

**Benchmark any combination of Ollama local and frontier LLMs simultaneously — side-by-side, in your browser, with zero cloud lock-in.**

<br/>

[Quickstart](#quickstart) · [Features](#features) · [Architecture](#architecture) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting)

</div>

---

## What is LMLab?

LMLab is a **self-hosted LLM evaluation dashboard** that lets you fire the same prompt at multiple models simultaneously and compare their outputs across latency, throughput, and token counts — all from a single browser tab.

It unifies **local models via Ollama** and **7 frontier providers** (OpenAI, Anthropic, Google Gemini, DeepSeek, Mistral, Groq) behind a single evaluation pipeline — no Python environment, no notebooks, no infrastructure. Clone the repo, run `node server.js`, and you're benchmarking.

```
Total benchmark time ≈ slowest model (all models run in parallel)
```

---

## Features

### Evaluation Engine
| Capability | Detail |
|---|---|
| **Parallel execution** | All selected models fire simultaneously; wall time equals the slowest single model |
| **Live result cards** | Each card updates the moment its model responds — no waiting for the full batch |
| **7 backend providers** | Ollama · OpenAI · Anthropic · Gemini · DeepSeek · Mistral · Groq |
| **Ollama auto-management** | Server checks Ollama health, spawns `ollama serve` if needed, and cleans up on exit |
| **Dynamic model discovery** | Ollama models are discovered at runtime via `/api/tags` — no static config, no restarts |
| **Run cancellation** | Cancel any in-flight benchmark mid-run; completed results are preserved and charted, cancelled models shown distinctly |

### Metrics & Analytics
| Metric | Description |
|---|---|
| **Latency** | End-to-end response time in seconds, normalized across all backends |
| **Throughput** | Tokens per second during inference |
| **Token counts** | Prompt tokens, completion tokens, total — reported per model |
| **Best-of badges** | Fastest model is automatically highlighted |

### Visualization
- **Response cards** — full syntax-highlighted output per model, rendered simultaneously
- **Ranked comparison table** — full comparison between models
- **Latency chart** — horizontal bar chart comparing all models
- **Throughput chart** — tokens/sec across all models  
- **Token chart** — prompt vs. completion breakdown per model

### Sharing & Persistence
- **Shareable run links** — full run state (prompt, params, all outputs) is compressed, encoded into a URL fragment, and copied to clipboard. `viewer.html` renders it self-contained — no server, no API keys needed
- **Saved runs history** — up to 50 runs persist in `localStorage` across sessions. A slide-in drawer lets you load, re-run, rename, export as JSON, or delete any saved run. Oldest run auto-evicted when storage fills

### Developer Experience
- **Zero `npm install`** — no `node_modules`, no build step, no bundler
- **Single config file** — `js/config.js` controls everything: models, colors, presets, defaults
- **Light / dark theme** — zero-flash theme switching persisted to `localStorage`, respects `prefers-color-scheme` on first visit
- **28-color backend-consistent palette** — 7 hue families, one per provider; chart bars, card accents, and model dots are always backend-scannable

---

## Quickstart

### Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Uses native `fetch` and `fs/promises` |
| **Ollama** *(optional)* | [ollama.com/download](https://ollama.com/download) — required only for local models |
| **Provider API keys** *(optional)* | Required only for the providers you want to benchmark — entered directly in the UI sidebar |

Verify Node.js version:

```bash
node --version   # must be v18.0.0 or higher
```

### Install & Run

```bash
# 1. Clone the repository
git clone https://github.com/W7CH/lmlab.git
cd lmlab

# 2. Start the server — that's it, no npm install
node server.js

# 3. Open the dashboard
#    → http://localhost:8080
```

The server will:
- Serve all static assets
- Check Ollama health on startup and auto-start `ollama serve` if needed
- Proxy all `/v1/*` requests to Ollama (eliminates CORS entirely)
- Proxy Anthropic API calls through `/api/anthropic/messages`
- Expose `/api/ollama/models` for runtime model discovery

Press `Ctrl+C` to stop. If the server started Ollama, it will be stopped cleanly.

### Pull your Ollama models

Models must be pulled before they appear in the dashboard. Any model shown by `ollama list` is auto-discovered:

```bash
ollama pull llama3.2
ollama pull gemma3
ollama pull deepseek-r1:1.5b
ollama pull phi3
ollama pull qwen3.5:2b
```

Verify they are available:

```bash
ollama list
```

> No need to edit any config file — the dashboard queries `/api/tags` at runtime and builds the model list automatically. Use the `↺` button in the sidebar to pick up newly pulled models without restarting.

---

## Architecture

LMLab uses a thin Node.js proxy (`server.js`) that sits between the browser and all model backends. The browser never talks directly to Ollama or any cloud provider — all traffic is routed through the proxy, which eliminates CORS and keeps API keys server-side.

### Ollama Flow

```
Browser                  server.js                  Ollama
───────────────────────────────────────────────────────────────

GET /api/ollama/health ──► checkOllamaHealth()
                          ───► fetch(:11434/api/tags) ────────►
                          ◄───────── { running, models } ──────
◄──────── JSON ───────────

GET /api/ollama/models ──► listOllamaModels()
                          ───► fetch(:11434/api/tags) ────────►
                          ◄─ [{ id, label, family, sizeGb }] ──
◄──────── JSON ───────────

POST /api/ollama/start ──► spawn("ollama serve")
                          ──────► poll until ready ───────────►
                          ◄────────── { running: true } ───────
◄──────── JSON ───────────

POST /v1/chat/completions ───► proxy to :11434/v1/ ───────────►
                              ◄──────── streamed tokens ───────
◄────── streamed response ────
```

### Anthropic Flow

```
Browser                  server.js                Anthropic
───────────────────────────────────────────────────────────────

POST /api/anthropic/ ────► proxyToAnthropic()
  {messages, model}        strips apiKey field
                           adds x-api-key header ─────────────►
                           ◄───────────── response ────────────
◄── response to browser ──
```

> OpenAI, Gemini, DeepSeek, Mistral, and Groq use the OpenAI-compatible schema — their calls go directly from the browser since they support CORS. Anthropic is the only provider that requires a server-side proxy.

---

## Project Structure

```
lmlab/
├── server.js           # Dev server, Ollama lifecycle manager, API proxies
├── index.html          # App shell — HTML only, no inline styles or scripts
├── viewer.html         # Self-contained read-only share target, decodes run from URL fragment
│
├── css/
│   ├── variables.css   # Design tokens — :root (invariant), [data-theme="dark/light"]
│   ├── layout.css      # Reset, header, sidebar, content area
│   └── components.css  # Every reusable UI component
│
└── js/
    ├── config.js       # Models per backend, palette, presets, defaults
    ├── ollama.js       # Browser-side Ollama health check, auto-start, model discovery
    ├── api.js          # fetch() wrappers for all 7 backends
    ├── eval.js         # Parallel evaluation orchestrator (multi-backend dispatch)
    ├── share.js        # Serialization, compression, URL generation, clipboard copy
    ├── runs.js         # Pure localStorage CRUD — no DOM, no imports
    ├── loadRun.js      # Restore UI from stored run, handle rerun + Ollama guard
    ├── runsPanel.js    # Saved runs drawer — render + user actions
    ├── ui.js           # DOM builders: cards, model list, skeletons, status bar
    ├── charts.js       # Latency, Throughput, Tokens charts + comparison table
    ├── theme.js        # initTheme, toggleTheme, applyTheme (shared by index + viewer)
    ├── tabs.js         # Tab switching via data-tab attributes (shared by index + viewer)
    ├── utils.js        # Shared helpers for runsPanel + loadRun
    └── main.js         # Entry point — wires everything
```

> **The only file you need to touch regularly is `js/config.js`.** Everything else — model discovery, evaluation, rendering, persistence — is self-contained.

---

## Configuration

### Adding or Removing Frontier Models

Cloud models are declared statically in `js/config.js`. Each provider has its own named array:

```js
export const GEMINI_MODELS    = [ /* Gemini 1.5 Pro, Flash, … */ ];
export const OPENAI_MODELS    = [ /* gpt-4o, gpt-4o-mini, … */ ];
export const ANTHROPIC_MODELS = [ /* Claude Haiku 4.5, Sonnet 4.6, Opus 4.6 */ ];
export const DEEPSEEK_MODELS  = [ /* deepseek-chat (V3), deepseek-reasoner (R1) */ ];
export const MISTRAL_MODELS   = [ /* Small, Medium, Large, … */ ];
export const GROQ_MODELS      = [ /* Llama 3.3 70B, Llama 3.1 8B Instant, Gemma 2 9B, Mixtral 8×7B, Kimi K2 */ ];
```

To add a model, append an entry to the relevant array:

```js
{
  id: 'gpt-4.1',          // exact name
  label: 'GPT-4.1',       // display name in the UI
  backend: 'openai',
  active: false,          // pre-selected by default?
}
```

Colors are assigned automatically from a 28-color palette organized into 7 hue families — one per backend. You never need to specify a `color` field.

### Adding Prompt Presets

```js
// js/config.js
export const PRESETS = {
  // ... existing ...
  'Linked list': `Implement a singly linked list in Python with insert, delete, search, and reverse. Include type hints and unit tests.`,
  // Add your own:
  'My prompt':  `...`,
};
```

### Changing Defaults

```js
// js/config.js
export const DEFAULTS = {
  temperature: 0.3,   // lower = more deterministic
  maxTokens:   2048,
};
```

### Theming

The stylesheet uses three token scopes in `css/variables.css`:

- **`:root`** — truly invariant tokens: font stacks, border radii
- **`[data-theme="dark"]`** — full color token set for dark mode (the default)
- **`[data-theme="light"]`** — overrides: lighter surfaces, inverted border alphas, warmer shimmer stops

To retheme, edit values in the relevant `[data-theme]` block. Both themes switch instantly with zero flash.

### Sharing Results

After a successful run, a **Share** button appears in the Run Summary header. Clicking it:

1. Serializes the full run snapshot (prompt, parameters, all model results)
2. Compresses and base64url-encodes the payload into a URL fragment
3. Copies `viewer.html#<encoded-data>` to your clipboard

The recipient opens the URL to see the full comparison — all charts, syntax-highlighted response cards, summary metrics — with no server running and no API keys required. The viewer includes its own dark/light theme toggle.

> **Note:** Share URLs encode the entire payload in the fragment. Very long outputs across many models can approach browser URL limits (~2 MB). For routine comparisons, this is not a concern.

---

## Troubleshooting

**Ollama fails to start — error shown in sidebar**  
The exact error is displayed in the sidebar status indicator (e.g. `` `ollama` not found on PATH ``). Install Ollama from [ollama.com](https://ollama.com/download), ensure it's on your `PATH`, then click `↺` to retry.

**Ollama starts but no models appear**  
Run `ollama list` to confirm models are pulled locally. Click `↺` to re-trigger discovery. Models must be pulled before they can appear in the dashboard.

**Gemini / OpenAI / Anthropic / DeepSeek / Mistral / Groq returns 401**  
Your API key is missing or invalid. Check the corresponding key field in the sidebar.

**OpenAI `o` model returns an error about `temperature`**  
The `o`-series models don't accept a `temperature` parameter. LMLab handles this automatically — `temperature` is omitted when the model ID starts with `o`.

**Anthropic calls fail with a CORS error**  
Ensure you are accessing the dashboard via `http://localhost:8080` and not directly as a `file://` URL. The Anthropic proxy only works through `server.js`.

**Theme flashes wrong color on load**  
`initTheme()` runs before the first render and should prevent this. If you see a flash, check that your browser isn't blocking `localStorage` or overriding inline scripts. Clearing `localStorage` resets the theme preference to the OS default.

**Port 8080 already in use**  
Change `const PORT = 8080` at the top of `server.js` to any available port.

**Node.js version error on startup**  
Upgrade to Node 18 or later from [nodejs.org](https://nodejs.org/en/download).

---

## Contributions

Contributions are always welcome! 

If you are interested in collaborating or have ideas on how to improve this project, please feel free to reach out:

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/wassim-chakroun/)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:wess.chakroun@yahoo.com)

---

## License

[GNU GPLv3](https://choosealicense.com/licenses/gpl-3.0/)

---

<div align="center">

*Built to make LLM comparison fast, reproducible, and dependency-free.*

</div>
