import { FUNCTION_WORDS } from './lexicon.js';
import type { CommandRecognizer } from './types.js';

// Words that typically open a question or an instruction to an agent.
const PROMPT_WORDS = new Set([
  'what', 'how', 'why', 'when', 'who', 'where', 'which', 'whose', 'can', 'could', 'should',
  'would', 'will', 'is', 'are', 'am', 'do', 'does', 'did', 'please', 'explain', 'describe',
  'write', 'summarize', 'summarise', 'list', 'tell', 'give', 'show', 'find', 'create',
  'generate', 'make', 'help', 'translate', 'convert', 'fix', 'refactor', 'implement', 'add',
  'remove', 'compare', 'suggest', 'review', 'draft', 'rewrite', 'analyze', 'analyse',
]);

// Shell metacharacters / SQL-ish punctuation that argue against this being plain prose.
const SYMBOLIC = /[|&;<>`$\\]|\$\(/;

// Recognize a natural-language prompt for the agent (acp). This is the prose catch-all: a
// trailing `?`, an opening question/instruction word, or simply several mostly-alphabetic
// words all read as a prompt.
export const acpRecognizer: CommandRecognizer = {
  route: 'acp',
  recognize: (command) => {
    const trimmed = command.trim();
    const words = trimmed.split(/\s+/);
    const first = words[0]?.toLowerCase() ?? '';
    const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
    const alphaRatio = trimmed.length > 0 ? letters / trimmed.length : 0;

    let score = 0;
    score = /\?\s*$/.test(trimmed) ? 0.8 : score;
    if (PROMPT_WORDS.has(first)) score = Math.max(score, 0.6);
    if (words.length >= 3 && !SYMBOLIC.test(trimmed) && alphaRatio > 0.7) {
      score = Math.max(score, 0.5);
    }

    // A question/instruction opener followed by grammatical words reads as a real sentence
    // ("which file is the longest"), not a command — strong enough to dispatch on its own.
    const functionInRest = words.slice(1).filter((w) => FUNCTION_WORDS.has(w.toLowerCase())).length;
    if (PROMPT_WORDS.has(first) && functionInRest >= 1) score += 0.2;

    score = Math.min(score, 0.95);
    return { match: score >= 0.4, reliability: score };
  },
};
