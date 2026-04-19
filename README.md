# LMLab

A browser dashboard for evaluating and comparing LLM models side-by-side using the **`chat.completions`** API.

Supports **Ollama** (local models) and **Google Gemini** — both via the same OpenAI-compatible request shape.

![screenshot placeholder](https://placehold.co/600x200/0d0f14/6c8bff?text=LMLab)

---

## Features

- **Parallel evaluation** — all selected models fire simultaneously; total time ≈ slowest model
- **Live cards** — each result card updates the moment its model responds
- **3 views** — side-by-side response cards · ranked comparison table · latency bar chart
- **Metrics** — latency (ms), estimated token count, tokens/sec, fastest-model badge
- **Syntax highlighting** — Python code blocks via highlight.js
- **Preset prompts** — 6 built-in Python coding tasks; add your own in `js/config.js`
- **Configurable** — temperature, max tokens all editable in the UI
- **Ollama-friendly** — Ollama is automatically checked and started before each run. A live status indicator in the sidebar shows whether Ollama is running, and `server.js` will spawn `ollama serve` for you if it isn't.

---

## Project Structure

```
lmlab/
├── server.js           # Dev server + Ollama lifecycle manager (run this)
├── index.html          # Page shell — HTML only, no inline styles or scripts
├── css/
│   ├── variables.css   # Design tokens (:root) — edit to retheme
│   ├── layout.css      # Reset, header, sidebar, content area
│   └── components.css  # Every reusable UI component
├── js/
│   ├── config.js       # Model registry + prompt presets — edit to add models
│   ├── ollama.js       # Browser-side Ollama health check + auto-start client
│   ├── api.js          # fetch() wrappers for Ollama (via proxy) and Gemini
│   ├── ui.js           # DOM builders (cards, model list, status bar, Ollama pill)
│   ├── charts.js       # Latency bar chart + comparison table
│   ├── eval.js         # Parallel evaluation orchestrator
│   └── main.js         # Entry point — wires everything, handles tabs
└── README.md
```

> **The only file you need to edit regularly is `js/config.js`** — add/remove models, change defaults, write new prompt presets.
---

## How it works

```
Browser                  server.js               Ollama
────────────────────────────────────────────────────────────

GET /api/ollama/health ──► checkOllamaHealth()
                          ──► fetch(:11434/api/tags) ──────►
                          ◄──────── { running, models } ────
◄──────── JSON response ──

POST /api/ollama/start ──► spawn("ollama serve")
                          ──► poll until ready ────────────►
                          ◄──────── { running: true } ──────
◄──────── JSON response ──

POST /v1/chat/completions ─► proxy to :11434/v1/ ──────────►
                            ◄──────── streamed response ────
◄────── streamed response ──
```

- The browser **never talks directly to Ollama** — all traffic goes through the proxy. This eliminates CORS issues entirely.
- If Ollama is already running when the page loads, it is used as-is and the auto-start is skipped.
- If `ollama serve` was started by the server, it is stopped cleanly when you press `Ctrl+C`.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Uses native `fetch` and `fs/promises` |
| **Ollama** | [ollama.com](https://ollama.com/download) |
| **Google AI Studio API key** | Required only for Gemini models — [get one here](https://aistudio.google.com/app/apikey) |

Verify Node.js version:

```bash
node --version   # must be v18.0.0 or higher
```

### Pull your Ollama models
  
The server will start Ollama, but models must be pre-pulled:

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

> **Important:** The model `id` in `js/config.js` must exactly match the name shown by `ollama list` (e.g. `llama3.2`, not `llama3`).

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

Press `Ctrl+C` to stop. If the server started Ollama, it will be stopped too.

---

## Configuration

### Adding / removing models  (`js/config.js`)

```js
// Add an Ollama model
{
  id:      'mistral',       // exact name from `ollama list`
  label:   'Mistral 7B',
  backend: 'ollama',
  color:   '#f59e0b',       // bar chart accent colour
  active:  false,           // pre-selected by default?
},

// Add a Gemini model
{
  id:      'gemini-1.5-pro',
  label:   'Gemini 1.5 Pro',
  backend: 'gemini',
  color:   '#34d399',
  active:  false,
},
```

### Adding prompt presets  (`js/config.js`)

```js
export const PRESETS = {
  // ... existing ...
  'Linked list': `Implement a singly linked list in Python with insert, delete,
search, and reverse. Include type hints and unit tests.`,
};
```

### Changing defaults  (`js/config.js`)

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

- **Ollama starts but models return errors:**
Run `ollama list` and verify the model names match the `id` fields in `js/config.js` exactly (e.g. `llama3.2`, not `llama3`).

- **Gemini returns 401:**

  Your API key is invalid or missing. Get one at https://aistudio.google.com/app/apikey and enter it in the sidebar.

- **Port 8080 already in use:**
Change `const PORT = 8080` at the top of `server.js` to any free port.

- **Node.js version too old:**
`node server.js` will print a syntax error. Upgrade to Node 18+:

  Get the right installer from https://nodejs.org/en/download

---

## Contributions

Contributions are always welcome! 

If you are interested in collaborating or have ideas on how to improve this project, please feel free to reach out:

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/wassim-chakroun/)
[![Email](https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:wess.chakroun@yahoo.com)

---

## License

[MIT](https://choosealicense.com/licenses/mit/)
