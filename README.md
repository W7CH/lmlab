# LMLab

A browser dashboard for evaluating and comparing LLM models side-by-side using the **`chat.completions`** API.

Supports **Ollama** (local models), **Google Gemini**, **Anthropic**, and **OpenAI** — all routed through a unified evaluation pipeline.

![Header](https://capsule-render.vercel.app/api?type=blur&height=300&color=gradient&text=LMLab&fontColor=Black&animation=twinkling)

---

## Features

- **Parallel evaluation** — all selected models fire simultaneously; total time ≈ slowest model
- **Live cards** — each result card updates the moment its model responds
- **3 views** — side-by-side response cards · ranked comparison table · latency bar chart
- **Metrics** — latency (s), estimated token count, tokens/sec, fastest-model badge
- **Syntax highlighting** — Python code blocks via highlight.js
- **Preset prompts** — 6 built-in Python coding tasks; add your own in `js/config.js`
- **Configurable** — temperature, max tokens all editable in the UI

---

## What's new?

★ Ollama is automatically checked and started before each run. A live status indicator in the sidebar shows whether Ollama is running, and `server.js` will spawn `ollama serve` for you if it isn't.

★ Ollama models are **auto-discovered at runtime**  — no more maintaining a manual list. The dashboard queries Ollama's `/api/tags` endpoint (`ollama list`), builds a friendly model list with size badges (e.g. `3.8 GB`), and assigns colors automatically. A `↺` re-check button lets you pick up newly pulled models without restarting. Skeleton loading states and error messages are shown while discovery is in flight.

★ **Anthropic** and **OpenAI** are now first-class backends. Add your API keys in the sidebar and run GPT-4o, o1-mini, Claude Haiku, Sonnet, and Opus side-by-side with your local Ollama models. Anthropic calls are proxied through `server.js` to work around CORS. Latency display is normalized to seconds across all backends.


---

## Project Structure

```
lmlab/
├── server.js           # Dev server + Ollama lifecycle manager + API proxies (run this)
├── index.html          # Page shell — HTML only, no inline styles or scripts
├── css/
│   ├── variables.css   # Design tokens (:root) — edit to retheme
│   ├── layout.css      # Reset, header, sidebar, content area
│   └── components.css  # Every reusable UI component
├── js/
│   ├── config.js       # GEMINI_MODELS, ANTHROPIC_MODELS, OPENAI_MODELS, CHART_COLORS, presets, defaults
│   ├── ollama.js       # Browser-side Ollama health check, auto-start, model discovery
│   ├── api.js          # fetch() wrappers for Ollama, Gemini, Anthropic, and OpenAI
│   ├── ui.js           # DOM builders (cards, model list, skeletons, status bar, Ollama pill)
│   ├── charts.js       # Latency bar chart + comparison table
│   ├── eval.js         # Parallel evaluation orchestrator (multi-backend dispatch)
│   └── main.js         # Entry point — wires everything, handles tabs
└── README.md
```

> **The only file you need to edit regularly is `js/config.js`** — add/remove cloud models (Gemini, Claude, etc.), update color palette, write new prompt presets, change defaults.
---

## How it works

```
Browser                  server.js               Ollama
────────────────────────────────────────────────────────────

GET /api/ollama/health ──► checkOllamaHealth()
                          ──► fetch(:11434/api/tags) ──────►
                          ◄──────── { running, models } ────
◄──────── JSON response ──

GET /api/ollama/models ──► listOllamaModels()
                          ──► fetch(:11434/api/tags) ──────►
                          ◄── [{ id, label, family, 
                              parameterSize, sizeGb }] ─────
◄──────── JSON response ──

POST /api/ollama/start ──► spawn("ollama serve")
                          ──► poll until ready ────────────►
                          ◄──────── { running: true } ──────
◄──────── JSON response ──

POST /v1/chat/completions ─► proxy to :11434/v1/ ──────────►
                            ◄──────── streamed response ────
◄────── streamed response ──

Browser                  server.js               Anthropic
────────────────────────────────────────────────────────────
POST /api/anthropic/ ────► proxyToAnthropic()
  messages                 strips apiKey field
                           adds x-api-key header ──────────►
                          ◄─────────── response ────────────
◄── response to browser ──
```

- The browser **never talks directly to Ollama or Anthropic** — all traffic goes through the proxy. This eliminates CORS issues entirely.
- Ollama models are discovered dynamically via `GET /api/ollama/models` — no static config needed.
- API keys for Anthropic are forwarded via `server.js` and are **never echoed back** to the client.
- If Ollama is already running when the page loads, it is used as-is and the auto-start is skipped.
- If `ollama serve` was started by the server, it is stopped cleanly when you press `Ctrl+C`.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Uses native `fetch` and `fs/promises` |
| **Ollama** | [ollama.com](https://ollama.com/download) |
| **Google AI Studio API key** | Required only for Gemini models — [get one here](https://aistudio.google.com/app/apikey) |
| **OpenAI API key** | Required only for GPT / o1 models — [get one here](https://platform.openai.com/api-keys) |
| **Anthropic API key** | Required only for Claude models — [get one here](https://console.anthropic.com/) |

Verify Node.js version:

```bash
node --version   # must be v18.0.0 or higher
```

### Pull your Ollama models
  
The server will start Ollama and fetch available models, but they must be pre-pulled:

```bash
ollama pull llama3.2
ollama pull gemma3
ollama pull deepseek-r1
ollama pull phi3
ollama pull qwen3.5
```

Verify they are available:

```bash
ollama list
```

> Ollama models are **auto-discovered** — you no longer need to list them in `js/config.js`. Any model shown by `ollama list` will appear in the dashboard automatically.

---

## How to Run

```bash
# 1. Clone or unzip the project
cd lmlab

# 2. Start the server (no npm install needed)
node server.js

# 3. Open the dashboard
#    → http://localhost:8080
```

That's it. The server:
- Serves all static files
- Checks whether Ollama is running on startup
- Auto-starts `ollama serve` before the first evaluation run if needed
- Proxies all `/v1/*` requests to Ollama (no CORS config required)
- Proxies Anthropic API calls through `/api/anthropic/messages`
- Exposes `/api/ollama/models` for dynamic model discovery

Press `Ctrl+C` to stop. If the server started Ollama, it will be stopped too.

---

## Configuration

### Ollama models — auto-discovered, no config needed

Ollama models are discovered at runtime by querying `/api/tags`. Pull a model and click `↺` in the sidebar to pick it up immediately — no restart or config change required.

### Adding / removing frontier models (`js/config.js`)

Cloud models (Gemini, OpenAI, Anthropic) are still declared statically since they don't have a local discovery endpoint:

```js
// Add a Gemini model
{
  id:      'gemini-1.5-pro', // exact name
  label:   'Gemini 1.5 Pro',
  backend: 'gemini',
  active:  false, // pre-selected by default?
},

// Add an Anthropic model
{
  id:      'claude-opus-4-6',
  label:   'Claude Opus 4.6',
  backend: 'anthropic',
  active:  true,
},

// Add an OpenAI model
{
  id:      'gpt-4o-mini',
  label:   'GPT-4o Mini',
  backend: 'openai',
  active:  false,
},
```

Colors are assigned automatically from `CHART_COLORS` by index across the full merged list (Ollama → Gemini → OpenAI → Anthropic). You no longer need to specify a `color` field per model.

### Adding prompt presets (`js/config.js`)

```js
export const PRESETS = {
  // ... existing ...
  'Linked list': `Implement a singly linked list in Python with insert, delete,
search, and reverse. Include type hints and unit tests.`,
};
```

### Changing defaults (`js/config.js`)

```js
export const DEFAULTS = {
  temperature: 0.3,    // lower = more deterministic
  maxTokens:   2048,
};
```

---

## Troubleshooting

- **`ollama: command not found`:**
Install Ollama from [ollama.com](https://ollama.com/download) and make sure it's on your `PATH`.

- **Ollama starts but no models appear:**
Run `ollama list` to confirm models are pulled. Click the `↺` button in the sidebar to re-run discovery. Models must be pulled before the server starts, or re-checked after pulling.

- **Gemini / OpenAI / Anthropic returns 401:**
Your API key is missing or invalid. Check the corresponding key field in the sidebar.

- **OpenAI `o1` model returns an error about `temperature`:**
The `o1` model family does not accept a `temperature` parameter. This is handled automatically — `temperature` is omitted when the model ID starts with `o1`.

- **Anthropic calls fail / CORS error:**
Make sure you are running `server.js` and accessing the dashboard via `http://localhost:8080`. Direct file access (`file://`) bypasses the proxy.

- **Port 8080 already in use:**
Change `const PORT = 8080` at the top of `server.js` to any free port.

- **Node.js version too old:**
`node server.js` will print a syntax error. Upgrade to Node 18+:

  Get the right installer from https://nodejs.org/en/download.

---

## Contributions

Contributions are always welcome! 

If you are interested in collaborating or have ideas on how to improve this project, please feel free to reach out:

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/wassim-chakroun/)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:wess.chakroun@yahoo.com)

---

## License

[MIT](https://choosealicense.com/licenses/mit/)
