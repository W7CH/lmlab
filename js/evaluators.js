/**
 * evaluators.js
 *
 * Pluggable evaluator registry for the LLM-as-a-Judge feature.
 *
 * Each evaluator exposes:
 *   label       — display name shown in the selector
 *   buildPrompt({ prompt, systemPrompt, results }) → string
 *   parse(responseText) → { scores, ranking, winner, reason }
 *
 * To add a new evaluator, extend EVALUATORS with a new key.
 */

export const EVALUATORS = {
  default: {
    label: 'General Quality',

    buildPrompt({ prompt, systemPrompt, results }) {
      const ok = results.filter(r => r.status === 'ok');
      if (ok.length === 0) throw new Error('No successful model responses to evaluate.');

      const responseBlocks = ok.map(r =>
        `<response model_id="${r.model.id}" label="${r.model.label}">\n${r.text}\n</response>`
      ).join('\n\n');

      // Embed real model IDs in the example so the judge mirrors the exact keys
      const exampleScores = Object.fromEntries(
        ok.map(r => [r.model.id, { correctness: 8, robustness: 7, efficiency: 9, quality: 8 }])
      );
      const exampleRanking = ok.map(r => r.model.id);

      return `You are an expert LLM evaluator. Score the model responses below, then return a single JSON object.

## Task Prompt
${systemPrompt ? `**System:** ${systemPrompt}\n\n` : ''}**User:** ${prompt}

## Model Responses
${responseBlocks}

## Scoring Criteria (integer 1–10 each)
- correctness: Accuracy, completeness, and factual correctness
- robustness:  Handling of edge cases, error conditions, and real-world constraints
- efficiency:  Conciseness, algorithmic efficiency, minimal redundancy
- quality:     Style, readability, documentation, and best-practice adherence

## Required Output
Return ONLY valid JSON — no markdown code fences, no commentary before or after.

{
  "scores": ${JSON.stringify(exampleScores, null, 2)},
  "ranking": ${JSON.stringify(exampleRanking)},
  "winner": "${ok[0].model.id}",
  "reason": "One concise paragraph explaining the winner and key differentiators."
}

Now return the real evaluation JSON with accurate scores for all models.`;
    },

    parse(responseText) {
      let text = responseText.trim();
      // Strip markdown fences if the model ignored instructions
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) text = fence[1].trim();
      // Extract the outermost JSON object
      const start = text.indexOf('{');
      const end   = text.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON object found in judge response.');
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (!parsed.scores || !parsed.ranking || !parsed.winner) {
        throw new Error('Judge response is missing required fields (scores, ranking, winner).');
      }
      return parsed;
    },
  },
};
