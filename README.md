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

[Quickstart](#quickstart) · [Features](#features) · [LLM-as-Judge](#llm-as-judge-evaluation) · [Architecture](#architecture) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting)

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
| **Empty response detection** | Models that return blank content are automatically reclassified as errors, keeping analytics unaffected |
| **System prompt control** | Set a custom system prompt per run; 3 built-in presets or define your own in `js/config.js` |
| **LLM-as-Judge evaluation** | Score all responses with any model as judge; pluggable evaluator registry with criteria-based scoring, ranked output, and winner rationale |

### Metrics & Analytics
| Metric | Description |
|---|---|
| **Latency** | End-to-end response time in seconds, normalized across all backends |
| **Throughput** | Tokens per second during inference |
| **Token counts** | Prompt tokens, completion tokens, total — reported per model; estimated counts (when the API omits usage stats) are flagged with `~` |
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

## LLM-as-Judge Evaluation

After a benchmark run completes, LMLab can score all model responses using a second model as an automated judge. This turns raw latency and token data into a **qualitative assessment** — which model actually answered better, and why.

### How it works

1. Select an **evaluator type** from the dropdown (default: General Quality)
2. Select a **judge model** — any configured cloud model or local Ollama model, grouped by backend
3. Click **Evaluate** — the judge receives all responses in a single structured prompt and returns scores, a ranking, and a written rationale

The judge runs at temperature 0 with a strict JSON system prompt. The evaluation panel appears automatically after each run and resets at the start of the next one.

### Scoring criteria (General Quality evaluator)

| Criterion | What it measures |
|---|---|
| **Correctness** | Accuracy, completeness, factual correctness |
| **Robustness** | Edge case handling, error conditions, real-world constraints |
| **Efficiency** | Conciseness, algorithmic efficiency, minimal redundancy |
| **Quality** | Style, readability, documentation, best-practice adherence |

Each criterion is scored 1–10. The evaluator also produces an overall ranking and a concise paragraph naming the winner and key differentiators.

### Adding a custom evaluator

Evaluators live in `js/core/evaluators.js` as a pluggable registry. Add an entry and it appears in the dropdown automatically — no other wiring needed:

```js
// js/core/evaluators.js
export const EVALUATORS = [
  {
    id:    'security',
    label: 'Security Review',
    criteria: { /* your scoring dimensions */ },
    buildPrompt: ({ prompt, systemPrompt, responses }) => `...`,
    parse:       (raw) => { /* strip fences, validate, return scores */ },
  },
  // ...
];
```

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
node server.js # or: npm start

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
├── server.js              # Dev server, Ollama lifecycle manager, API proxies
├── index.html             # App shell — HTML only, no inline styles or scripts
├── viewer.html            # Self-contained read-only share target, decodes run from URL
├── package.json           # ES module config, npm start entry point
│
├── css/
│   ├── variables.css      # Design tokens — :root (invariant), [data-theme="dark/light"]
│   ├── layout.css         # Reset, header, sidebar, content area
│   └── components.css     # Every reusable UI component
│
└── js/
    │
    ├── api/               # Infrastructure — external HTTP calls, no DOM
    │   ├── llm.js         # fetch() wrappers for all 7 backends
    │   └── ollama.js      # Ollama health check, auto-start, model discovery
    │
    ├── core/              # Domain & data — business logic, no DOM dependencies
    │   ├── evaluators.js  # Pluggable judge evaluator registry
    │   ├── runs.js        # localStorage CRUD for saved runs
    │   └── share.js       # Payload serialization, compression, URL generation
    │
    ├── ui/                # Rendering — everything that touches the DOM
    │   ├── ui.js          # Cards, model list, skeletons, status bar, presets
    │   ├── charts.js      # Latency, throughput, token charts, comparison table
    │   └── runsPanel.js   # Saved runs slide-in drawer
    │
    ├── config.js          # Models per backend, color palette, presets, defaults
    ├── eval.js            # Parallel evaluation orchestrator (dispatch, abort control)
    ├── judge.js           # LLM-as-Judge orchestration + result rendering
    ├── loadRun.js         # Restore UI from a stored run; handle rerun + Ollama guard
    ├── theme.js           # initTheme / toggleTheme (shared by main + viewer)
    ├── tabs.js            # Tab switching via data-tab attributes (shared by main + viewer)
    ├── utils.js           # String helpers, HTML escaping, API key reader
    ├── main.js            # App entry point — wires everything together
    └── viewer.js          # Viewer entry point — decodes URL, renders read-only run
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
// User prompts
export const PRESETS = {
  // ... existing ...
  'Linked list': `Implement a singly linked list in Python with insert, delete, search, and reverse. Include type hints and unit tests.`,
  // Add your own:
  'My prompt':  `...`,
};
```

```js
// System prompts
export const SYSTEM_PRESETS = {
  'Chain-of-Thought': `Think step by step before giving your final answer.`,
  'JSON only':        `Respond exclusively with valid JSON. No prose, no markdown.`,
  // Add your own:
  'My persona':       `...`,
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

> **Note:** Share URLs encode the entire payload in the fragment. Very long outputs across many models can approach browser URL limits (~2 MB). Payloads under 200 KB are copied as-is. Larger payloads are automatically rebuilt with responses capped at 2,000 characters and re-compressed — the viewer will show trimmed responses but all metrics and timing are preserved. If the result still exceeds 1.5 MB, the Share button will report **✗ Too large** with an explanation. In practice, this only occurs when benchmarking many models with very long outputs simultaneously.

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

**Model shows an error card with "Empty response"**  
Some models, most commonly local `deepseek-r1` variants, occasionally return a blank completion body. This happens when the model stops generating without producing any tokens (e.g. context window exceeded, quantization artifact, or a mismatch between the prompt format and the model's template). LMLab automatically reclassifies empty responses as errors so they do not skew analytics. Try reducing **Max tokens**, lowering the prompt complexity, or pulling a different quantization of the model.

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
