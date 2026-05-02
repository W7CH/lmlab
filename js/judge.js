/**
 * judge.js
 *
 * LLM-as-a-Judge orchestration.
 *
 * Public API:
 *   populateJudgeSelector(allModels) — fill the judge model <select>
 *   populateEvaluatorSelector()      — fill the evaluator <select>
 *   showJudgeSection()               — reveal #judgeSection after a run
 *   hideJudgeSection()               — hide + reset when a new run starts
 *   runJudge(runData, allModels)     — perform evaluation
 *   getLastEvaluation()              — latest result for saving/sharing
 *   renderEvaluationResults(eval, results) — re-render from saved run
 */

import { callOllama, callGemini, callOpenAI, callAnthropic, callDeepSeek, callMistral, callGroq } from './api.js';
import { ensureOllamaRunning } from './ollama.js';
import { EVALUATORS } from './evaluators.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

let _lastEval = null;

export function getLastEvaluation() { return _lastEval; }

// ─── SELECTOR SETUP ──────────────────────────────────────────────────────────

/**
 * Populate the judge model <select> from the live model list.
 * Preserves the user's previous selection across refreshes.
 * Defaults to Gemini 2.5 Flash → any cloud model → first model.
 */
export function populateJudgeSelector(allModels) {
  const sel = document.getElementById('judgeModelSelect');
  if (!sel) return;

  const prev = sel.value;
  sel.innerHTML = '<option value="">— Select judge model —</option>';

  // Group by backend for a labelled optgroup per provider
  const groups = {};
  allModels.forEach(m => {
    if (!groups[m.backend]) groups[m.backend] = [];
    groups[m.backend].push(m);
  });

  Object.entries(groups).forEach(([backend, models]) => {
    const grp = document.createElement('optgroup');
    grp.label = backend.charAt(0).toUpperCase() + backend.slice(1);
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value       = m.id;
      opt.textContent = m.label;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });

  // Restore previous or pick a sensible default
  if (prev && [...sel.options].some(o => o.value === prev)) {
    sel.value = prev;
  } else {
    const preferred =
      allModels.find(m => m.id === 'gemini-2.5-flash') ??
      allModels.find(m => m.backend !== 'ollama')       ??
      allModels[0];
    if (preferred) sel.value = preferred.id;
  }
}

/** Populate the evaluator <select> from the EVALUATORS registry. */
export function populateEvaluatorSelector() {
  const sel = document.getElementById('evaluatorSelect');
  if (!sel || sel.options.length > 0) return; // already populated
  Object.entries(EVALUATORS).forEach(([id, ev]) => {
    const opt = document.createElement('option');
    opt.value       = id;
    opt.textContent = ev.label;
    sel.appendChild(opt);
  });
  sel.value = 'default';
}

// ─── VISIBILITY ──────────────────────────────────────────────────────────────

export function showJudgeSection() {
  document.getElementById('judgeSection')?.classList.remove('hidden');
}

export function hideJudgeSection() {
  document.getElementById('judgeSection')?.classList.add('hidden');
  setJudgeStatus('', '');
  const results = document.getElementById('judgeResults');
  if (results) { results.innerHTML = ''; results.classList.add('hidden'); }
  _lastEval = null;
}

// ─── EVALUATION RUNNER ───────────────────────────────────────────────────────

/**
 * Run the evaluation against the selected judge model.
 *
 * @param {{ prompt, systemPrompt, results }} runData — from eval.getLastRunData()
 * @param {object[]} allModels
 */
export async function runJudge(runData, allModels) {
  const judgeModelId = document.getElementById('judgeModelSelect')?.value;
  const evaluatorId  = document.getElementById('evaluatorSelect')?.value ?? 'default';

  if (!judgeModelId) {
    setJudgeStatus('error', 'Select a judge model first.');
    return;
  }

  const judgeModel = allModels.find(m => m.id === judgeModelId);
  if (!judgeModel) {
    setJudgeStatus('error', 'Judge model not found — refresh the model list.');
    return;
  }

  const evaluator = EVALUATORS[evaluatorId];
  if (!evaluator) {
    setJudgeStatus('error', 'Unknown evaluator selected.');
    return;
  }

  // Validate: need at least one successful response
  const ok = (runData.results ?? []).filter(r => r.status === 'ok');
  if (ok.length === 0) {
    setJudgeStatus('error', 'No successful model responses to evaluate.');
    return;
  }

  // Build evaluation prompt
  let judgePrompt;
  try {
    judgePrompt = evaluator.buildPrompt(runData);
  } catch (err) {
    setJudgeStatus('error', err.message);
    return;
  }

  // Ollama guard
  if (judgeModel.backend === 'ollama') {
    setJudgeStatus('starting', 'Starting Ollama for judge…');
    try {
      await ensureOllamaRunning(msg => setJudgeStatus('starting', msg));
    } catch (err) {
      setJudgeStatus('error', `Ollama failed to start: ${err.message}`);
      return;
    }
  }

  setJudgeStatus('running', `Asking ${judgeModel.label} to evaluate responses…`);
  setEvaluateBtn(true);

  let responseText;
  try {
    const keys = readApiKeys();
    const res  = await callJudgeModel(judgeModel, judgePrompt, keys);
    responseText = res.text;
  } catch (err) {
    setJudgeStatus('error', `Judge call failed: ${err.message}`);
    setEvaluateBtn(false);
    return;
  }

  let parsed;
  try {
    parsed = evaluator.parse(responseText);
  } catch (err) {
    setJudgeStatus('error',
      `Could not parse judge response — ${err.message}. ` +
      `Raw: ${responseText.slice(0, 200)}…`
    );
    setEvaluateBtn(false);
    return;
  }

  _lastEval = {
    evaluatorId,
    judgeModel: { id: judgeModel.id, label: judgeModel.label, backend: judgeModel.backend },
    ...parsed,
  };

  setJudgeStatus('', '');
  setEvaluateBtn(false);
  renderEvaluationResults(_lastEval, runData.results);
}

// ─── RESULT RENDERING ────────────────────────────────────────────────────────

/**
 * Render evaluation results into #judgeResults.
 * Called both after a live evaluation and when loading a saved run.
 *
 * @param {object}   evalResult  — { scores, ranking, winner, reason, judgeModel }
 * @param {object[]} results     — run results (for model color/label lookup)
 */
export function renderEvaluationResults(evalResult, results) {
  _lastEval = evalResult;

  const container = document.getElementById('judgeResults');
  if (!container) return;

  const { scores = {}, ranking = [], winner, reason, judgeModel } = evalResult;
  const modelMap = Object.fromEntries(results.map(r => [r.model.id, r.model]));

  // Build ordered list: ranking first, then any remaining models
  const ranked = [
    ...ranking.map(id => ({ id, model: modelMap[id] })),
    ...Object.keys(scores)
      .filter(id => !ranking.includes(id))
      .map(id => ({ id, model: modelMap[id] })),
  ].filter(m => m.model);

  const winnerModel = modelMap[winner];
  const criteria    = ['correctness', 'robustness', 'efficiency', 'quality'];

  // ── Winner banner ──────────────────────────────────────────────────────────
  const winnerHtml = winnerModel ? `
    <div class="judge-winner-card" style="--winner-color: ${winnerModel.color};">
      <div class="judge-winner-icon">★</div>
      <div class="judge-winner-info">
        <span class="judge-winner-eyebrow">Winner</span>
        <span class="judge-winner-name">${escHtml(winnerModel.label)}</span>
      </div>
      ${judgeModel ? `<span class="judge-by">evaluated by ${escHtml(judgeModel.label)}</span>` : ''}
    </div>` : '';

  // ── Reason ────────────────────────────────────────────────────────────────
  const reasonHtml = reason
    ? `<p class="judge-reason">${escHtml(reason)}</p>` : '';

  // ── Score table ───────────────────────────────────────────────────────────
  const rows = ranked.map((m, i) => {
    const s    = scores[m.id] ?? {};
    const avg  = criteria.reduce((sum, c) => sum + (s[c] ?? 0), 0) / criteria.length;
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const cells = criteria.map(c => {
      const v = s[c] ?? '—';
      return `<td><span class="judge-score judge-score--${scoreClass(v)}">${v}</span></td>`;
    });
    return `
      <tr class="${m.id === winner ? 'judge-winner-row' : ''}">
        <td class="judge-rank-cell">${medal}</td>
        <td>
          <div class="judge-model-cell">
            <span class="judge-model-dot" style="background:${m.model.color};"></span>
            ${escHtml(m.model.label)}
          </div>
        </td>
        ${cells.join('')}
        <td class="judge-avg-cell">${avg.toFixed(1)}</td>
      </tr>`;
  }).join('');

  const tableHtml = `
    <div class="judge-table-wrap">
      <table class="judge-table">
        <thead>
          <tr>
            <th></th>
            <th>Model</th>
            ${criteria.map(c => `<th>${cap(c)}</th>`).join('')}
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.innerHTML = winnerHtml + reasonHtml + tableHtml;
  container.classList.remove('hidden');
}

// ─── PRIVATE ─────────────────────────────────────────────────────────────────

const JUDGE_TEMP       = 0;
const JUDGE_MAX_TOKENS = 2048;
const JUDGE_SYSTEM     = 'You are an expert LLM evaluator. You must respond with ONLY valid JSON — no markdown fences, no explanation text.';

async function callJudgeModel(model, prompt, keys) {
  switch (model.backend) {
    case 'ollama':    return callOllama(model.id, prompt, JUDGE_SYSTEM, JUDGE_TEMP, JUDGE_MAX_TOKENS, null);
    case 'gemini':    return callGemini(model.id, prompt, JUDGE_SYSTEM, JUDGE_TEMP, JUDGE_MAX_TOKENS, keys.geminiKey, null);
    case 'openai':    return callOpenAI(model.id, prompt, JUDGE_SYSTEM, JUDGE_TEMP, JUDGE_MAX_TOKENS, keys.openaiKey, null);
    case 'anthropic': return callAnthropic(model.id, prompt, JUDGE_SYSTEM, JUDGE_TEMP, JUDGE_MAX_TOKENS, keys.anthropicKey, null);
    case 'deepseek':  return callDeepSeek(model.id, prompt, JUDGE_SYSTEM, JUDGE_TEMP, JUDGE_MAX_TOKENS, keys.deepseekKey, null);
    case 'mistral':   return callMistral(model.id, prompt, JUDGE_SYSTEM, JUDGE_TEMP, JUDGE_MAX_TOKENS, keys.mistralKey, null);
    case 'groq':      return callGroq(model.id, prompt, JUDGE_SYSTEM, JUDGE_TEMP, JUDGE_MAX_TOKENS, keys.groqKey, null);
    default:          throw new Error(`Unknown backend: ${model.backend}`);
  }
}

function readApiKeys() {
  return {
    geminiKey:    document.getElementById('geminiKeyInput')?.value.trim()    ?? '',
    openaiKey:    document.getElementById('openaiKeyInput')?.value.trim()     ?? '',
    anthropicKey: document.getElementById('anthropicKeyInput')?.value.trim() ?? '',
    deepseekKey:  document.getElementById('deepseekKeyInput')?.value.trim()  ?? '',
    mistralKey:   document.getElementById('mistralKeyInput')?.value.trim()   ?? '',
    groqKey:      document.getElementById('groqKeyInput')?.value.trim()      ?? '',
  };
}

function setJudgeStatus(type, message) {
  const el = document.getElementById('judgeStatus');
  if (!el) return;
  if (!message) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.className    = `judge-status judge-status--${type}`;
  el.textContent  = message;
  el.classList.remove('hidden');
}

function setEvaluateBtn(loading) {
  const btn = document.getElementById('evaluateBtn');
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? 'Judging…' : '⚖ Judge';
}

function scoreClass(v) {
  if (typeof v !== 'number') return 'na';
  if (v >= 7) return 'high';
  if (v >= 5) return 'mid';
  return 'low';
}

function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function escHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
