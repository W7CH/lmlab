# LMLab

A zero-dependency browser dashboard for evaluating and comparing LLM models side-by-side using the **`chat.completions`** API.

Supports **Ollama** (local models) and **Google Gemini** — both via the same OpenAI-compatible request shape.

![screenshot placeholder](https://placehold.co/900x500/0d0f14/6c8bff?text=LMLab)

---

## Features

- **Parallel evaluation** — all selected models fire simultaneously; total time ≈ slowest model
- **Live cards** — each result card updates the moment its model responds
- **3 views** — side-by-side response cards · ranked comparison table · latency bar chart
- **Metrics** — latency (ms), estimated token count, tokens/sec, fastest-model badge
- **Syntax highlighting** — Python code blocks via highlight.js
- **Preset prompts** — 6 built-in Python coding tasks; add your own in `js/config.js`
- **Configurable** — temperature, max tokens, Ollama base URL all editable in the UI

---

## Project Structure

```
lmlab/
├── index.html          # Page shell — HTML only, no inline styles or scripts
├── css/
│   ├── variables.css   # Design tokens (:root) — edit to retheme
│   ├── layout.css      # Reset, header, sidebar, content area
│   └── components.css  # Every reusable UI component
├── js/
│   ├── config.js       # ★ Model registry + prompt presets — edit this to add models
│   ├── api.js          # fetch wrappers for Ollama and Gemini
│   ├── ui.js           # DOM builders (cards, model list, status bar, summary)
│   ├── charts.js       # Latency bar chart + comparison table
│   ├── eval.js         # Parallel evaluation orchestrator
│   └── main.js         # Entry point — wires everything together
└── README.md
```

> **The only file you need to edit regularly is `js/config.js`** — add/remove models, change defaults, write new prompt presets.

---

## Prerequisites

| Requirement | Purpose |
|---|---|
| A modern browser (Chrome 90+, Firefox 90+, Safari 15+, Edge 90+) | ES Modules support |
| [Ollama](https://ollama.com) installed and running | Local model inference |
| Google AI Studio API key | Gemini models only |

### Pull your Ollama models

```bash
ollama pull llama3.2
ollama pull qwen2.5
ollama pull gemma3
ollama pull phi3
ollama pull deepseek-r1
```

Verify they are available:

```bash
ollama list
```

> **Important:** The model `id` in `js/config.js` must exactly match the name shown by `ollama list` (e.g. `llama3.2`, not `llama3`).

---

## How to Run

Because the app uses ES Modules (`<script type="module">`), it **must be served over HTTP** — you cannot open `index.html` directly from the filesystem (`file://` URLs block module imports).

Choose any of the options below:

### Option 1 — Python (no install required)

```bash
cd lmlab
python3 -m http.server 8080
```

Then open: **http://localhost:8080**

### Option 2 — Node.js `serve`

```bash
npx serve lmlab
```

Then open the URL printed in the terminal (usually **http://localhost:3000**).

### Option 3 — VS Code Live Server extension

1. Open the `lmlab/` folder in VS Code
2. Right-click `index.html` → **Open with Live Server**

### Option 4 — Any static file server

```bash
# caddy
caddy file-server --root ./lmlab --listen :8080

# nginx (one-liner with Docker)
docker run -p 8080:80 -v $(pwd)/lmlab:/usr/share/nginx/html nginx
```

---

## Configuration

### Adding a new Ollama model

Open `js/config.js` and add an entry to the `MODELS` array:

```js
{
  id:      'mistral',       // must match `ollama list` exactly
  label:   'Mistral 7B',    // display name in the UI
  backend: 'ollama',
  color:   '#f59e0b',       // accent colour in the timing chart
  active:  false,           // selected by default?
},
```

### Adding a new Gemini model

```js
{
  id:      'gemini-1.5-pro',
  label:   'Gemini 1.5 Pro',
  backend: 'gemini',
  color:   '#34d399',
  active:  false,
},
```

### Adding a prompt preset

```js
export const PRESETS = {
  // ...existing presets...
  'Linked list': `Implement a singly linked list in Python with insert, delete, search, and reverse methods. Include type hints and unit tests.`,
};
```

### Changing default parameters

```js
export const DEFAULTS = {
  temperature: 0.3,    // lower = more deterministic
  maxTokens:   2048,
  ollamaUrl:   'http://192.168.1.10:11434',  // remote Ollama instance
};
```

---

## How the API calls work

Both backends use the identical OpenAI-compatible request shape in `js/api.js`:

```js
POST /v1/chat/completions
{
  "model":       "<model-id>",
  "messages":    [{ "role": "user", "content": "<prompt>" }],
  "temperature": 0.7,
  "max_tokens":  1024
}
```

| Backend | Endpoint | Auth |
|---|---|---|
| Ollama | `http://localhost:11434/v1/chat/completions` | None |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `Authorization: Bearer <API_KEY>` |

---

## Troubleshooting

**CORS error when calling Ollama**

Ollama blocks cross-origin requests by default. Set the environment variable before starting it:

```bash
OLLAMA_ORIGINS="*" ollama serve
# or on macOS/Linux, add to your shell profile:
export OLLAMA_ORIGINS="*"
```

**Model returns 404**

Run `ollama list` and copy the exact model name (including tag, e.g. `llama3.2:latest`) into the `id` field in `js/config.js`.

**Gemini returns 401**

Your API key is invalid or missing. Get one at https://aistudio.google.com/app/apikey and enter it in the sidebar.

**`file://` — module import blocked**

Open the app via a local HTTP server (see [How to Run](#how-to-run)). Browsers intentionally block ES Module imports on `file://` URLs.

---

## License

MIT
