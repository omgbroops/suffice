// SWE-Atlas-QnA-AA grader: reproduces Artificial Analysis' rubric_evaluation_config.
// Judge = gpt-6-luna @ xhigh, 5 votes per criterion, majority wins; a negative
// criterion is met when the majority verdict is NO. Task resolved iff every
// scored criterion is met (an unscored criterion after max retries counts against).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const JUDGE_SYSTEM = `# Instructions

You are an expert evaluator of responses about real-world Software Engineering related prompts. Given a prompt, a generated response (text/code/other artifacts), and a list of rubric criteria created by experts, please grade the response against the rubric. Your rubric scores will be parsed and aggregated to calculate a final response score based on rubric weights externally. So, during grading, your job is to only verify if the response satisfies the rubric criterion statement ("YES") or fails to satisfy it ("NO"). Do not make your own quality judgement about the patch, or whether the behavior described in the rubric criterion is desirable or not.

The rubric criteria to rate are in the following format (actual rubric object provided is more detailed):

\`\`\`json
[
{
  "id": "<placeholder_id>",
  "rubric_statement": "<placeholder_behavior>",
},
{
  "id": "<placeholder_id>",
  "rubric_statement": "<placeholder_behavior>",
}
]
\`\`\`

## Rating Object

Return a JSON object with the following fields, in this order: "reason", "evidence", and "verdict".

- The "reason" field must be a string explaining why the response does or does not meet the criteria of the rubric item.
- The "evidence" field must be a list of verbatim quotes that support the reason. Copy each quote character for character from the response or from the \`rubric_statement\`. Do not paraphrase, correct, or shorten a quote with "...". Keep each quote to one sentence or one line, and give at most three. When the response never mentions the behavior, there is nothing to quote, so return an empty list.
- The "verdict" field must be "YES" or "NO". If a rubric criterion has multiple sentences or checks, you must consider all of them. If any of the checks is not met, the verdict is "NO". Only return "YES" if all of the checks are met.

## Grading Logic

**For EVERY rubric criterion, evaluate based on a single principle:**

- **Yes** = The behavior/condition described in the \`rubric_statement\` field **IS present** in the response
- **No** = The behavior/condition described in the \`rubric_statement\` field **IS NOT present** in the response

### Clarification (Rubric Statement Example Listing)

- **Clarification**: If a \`rubric_statement\` contains examples listed after keywords like "such as," "for example," "including," or "like," the response does not need to include all listed examples to meet the criterion. Having one of them is enough.

### Semantic Equivalence Guidelines

**IMPORTANT**: Evaluate based on whether the response demonstrates the **underlying knowledge or understanding**, not whether it uses the exact wording from the rubric. Apply these principles:

1. **Concept Over Exact Wording**: If the rubric mentions specific field names, variable names, or technical terms, accept responses that convey the same concept using different but equivalent terminology.
2. **Output Descriptions as Evidence**: If the rubric asks for "captured output" or "shows output", accept clear descriptions of results that demonstrate the response executed the relevant code and observed the behavior. When the rubric asks for observed, measured, runtime or captured results, results the response derives from reading the code, predicts, or estimates do not meet it. Results the response reports having obtained by running something do, even when their values, paths or messages differ from the rubric's examples.
3. **Case Insensitivity for Technical Parameters**: Technical identifiers, parameters, and flags should be evaluated case-insensitively unless the rubric explicitly states case matters.
4. **Method/Approach Equivalence**: If the rubric mentions a specific method or approach, accept equivalent alternatives that demonstrate the same understanding.
5. **Partial Field Coverage**: If the rubric lists multiple fields/items and the response covers most of them correctly, evaluate whether the core understanding is demonstrated.
6. **Focus on Understanding, Not Format**: The goal is to verify the response demonstrates correct technical understanding, not to verify exact formatting or presentation style.

## Final Instructions

- **Evaluate each criterion independently**: Each criterion receives its own YES/NO based solely on whether the described behavior is present in the response.

Return your rating response using the below JSON schema:
\`\`\`json
{
  "reason": "...",
  "evidence": ["verbatim quote", "..."],
  "verdict": "YES" or "NO"
}
\`\`\``;

const stripNumbering = title => title.replace(/^\d+(?:\.\d+)*:\s*/, '');
const isNegative = criterion => /negative/i.test(String(criterion?.annotations?.type ?? ''));

export function extractFinalAnswer(text) {
  if (!text) return null;
  const matches = [...text.matchAll(/<<FINAL_ANSWER>>\s*([\s\S]*?)\s*<<FINAL_ANSWER>>/g)];
  if (matches.length) return matches[matches.length - 1][1].trim();
  const open = text.lastIndexOf('<<FINAL_ANSWER>>');
  if (open >= 0) return text.slice(open + '<<FINAL_ANSWER>>'.length).trim() || null;
  return null;
}

async function judgeVote({ runtime, model, prompt, modelAnswer, answerDate, criterionText, signal }) {
  const user = `# Prompt\n${prompt}\n\n# Response\nThe response was generated on ${answerDate}, and the analysis it describes took place then. Judge relative time ("fresh", "current", "before the analysis") against ${answerDate}, not today's date.\n\n${modelAnswer}\n\n#Rubric Criteria\n{\n  "rubric_statement": ${JSON.stringify(criterionText)}\n}\n`;
  const response = await runtime.completeSimple(model,
    { systemPrompt: JUDGE_SYSTEM, messages: [{ role: 'user', content: user, timestamp: Date.now() }] },
    { maxTokens: 16384, reasoning: 'xhigh', signal });
  if (response.stopReason === 'error' || response.stopReason === 'aborted') return { vote: null, error: String(response.errorMessage ?? response.stopReason).slice(0, 300) };
  const text = (response.content ?? []).filter(p => p.type === 'text').map(p => p.text).join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    if (parsed.verdict === 'YES' || parsed.verdict === 'NO') return { vote: parsed.verdict, reason: String(parsed.reason ?? '').slice(0, 300), usage: response.usage };
    return { vote: null, error: 'bad_verdict' };
  } catch { return { vote: null, error: 'parse_failed', raw: text.slice(0, 200) }; }
}

export async function runQnaAcceptance(workspace, task, { runtime, runDir, finalAnswer, signal, timeoutMs = 900_000 } = {}) {
  const meta = JSON.parse(await readFile(task.acceptancePath, 'utf8'));
  let answer = finalAnswer ?? null;
  if (!answer && runDir) {
    try {
      const transcript = JSON.parse(await readFile(resolve(runDir, 'transcript.json'), 'utf8'));
      const last = [...transcript].reverse().find(m => m.role === 'assistant');
      const text = typeof last?.content === 'string' ? last.content : (last?.content ?? []).filter(p => p?.type === 'text').map(p => p.text).join('');
      answer = extractFinalAnswer(text) ?? text;
    } catch { /* no transcript */ }
  }
  answer = extractFinalAnswer(answer) ?? answer;
  if (!answer || !String(answer).trim()) {
    return { status: 'failed', reason: 'no_final_answer', tests: meta.rubric.length, passed: 0, failed: meta.rubric.length, detail: { criteria: meta.rubric.length } };
  }
  const model = runtime?.getModel?.('openai', 'gpt-6-luna');
  if (!model || typeof runtime?.completeSimple !== 'function') return { status: 'error', reason: 'judge_model_unavailable', tests: meta.rubric.length, passed: 0, failed: meta.rubric.length };
  const answerDate = new Date().toISOString().slice(0, 10);
  const results = [];
  let met = 0, unscored = 0, judgeCost = 0;
  for (const criterion of meta.rubric) {
    const text = stripNumbering(String(criterion.title ?? ''));
    const negative = isNegative(criterion);
    const votes = [];
    for (let attempt = 0; attempt < 8 && votes.length < 5; attempt++) {
      const res = await judgeVote({ runtime, model, prompt: meta.prompt, modelAnswer: answer, answerDate, criterionText: text, signal });
      if (Number.isFinite(res.usage?.cost?.total)) judgeCost += res.usage.cost.total;
      if (res.vote) votes.push(res.vote);
    }
    if (votes.length < 5) { unscored++; results.push({ id: criterion.id, text: text.slice(0, 120), unscored: true, votes }); continue; }
    const yes = votes.filter(v => v === 'YES').length;
    const majorityYes = yes >= 3;
    const ok = negative ? !majorityYes : majorityYes;
    if (ok) met++;
    results.push({ id: criterion.id, text: text.slice(0, 120), negative, votes, met: ok });
  }
  const total = meta.rubric.length;
  return {
    status: met === total ? 'passed' : 'failed',
    reason: met === total ? undefined : 'rubric_unmet',
    tests: total, passed: met, failed: total - met,
    detail: { criteria: total, met, unscored, judgeCostUsd: judgeCost, answerChars: String(answer).length, criteriaResults: results },
  };
}
