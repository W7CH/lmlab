# LMLab

A browser dashboard for evaluating and comparing LLM models side-by-side using the **`chat.completions`** API.

Supports **Ollama** (local models) and **Google Gemini** — both via the same OpenAI-compatible request shape.

![Header](https://capsule-render.vercel.app/api?type=blur&height=300&color=gradient&text=LMLab&fontColor=Black&animation=twinkling)

---

## Features

- **Parallel evaluation** — all selected models fire simultaneously; total time ≈ slowest model
- **Live cards** — each result card updates the moment its model responds
- **3 views** — side-by-side response cards · ranked comparison table · latency bar chart
- **Metrics** — latency (ms), estimated token count, tokens/sec, fastest-model badge
- **Syntax highlighting** — Python code blocks via highlight.js
- **Preset prompts** — 6 built-in Python coding tasks; add your own in `js/config.js`
- **Configurable** — temperature, max tokens all editable in the UI
- **Ollama-friendly** — Ollama is automatically checked and started before each run. A live status indicator in the sidebar shows whether Ollama is running, and `server.js` will spawn `ollama serve` for you if it isn't. The server also runs `ollama list` at runtime to automatically discover Ollama models.

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

> **The only file you need to edit regularly is `js/config.js`** — add/remove frontier models (Gemini, Claude, etc.), update color palette, change defaults, write new prompt presets.
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
- Fetches available ollama models `ollama list` on boot and merges them with the frontier models declared in `js/config.js`
- Proxies all `/v1/*` requests to Ollama (no CORS config required)

Press `Ctrl+C` to stop. If the server started Ollama, it will be stopped too.

---

## Configuration

### Adding / removing frontier models  (`js/config.js`)

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
Run `ollama list` and verify the models available in Ollama.

- **Gemini returns 401:**
Your API key is invalid or missing. Get one at https://aistudio.google.com/app/apikey and enter it in the sidebar.

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
