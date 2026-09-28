// What the user has told the agent to keep doing, said in their own words.
//
// The prompt carries the last twelve turns and nothing else, so an instruction given in the first message
// is gone by the thirteenth — and neither the user nor the model can tell that from an instruction that
// was never followed. Power BI stores AI instructions on the model and injects them into every prompt;
// Databricks Genie supports per-agent general instructions plus a reserved trailing block for summary
// behaviour; Hex has a workspace context file for the same reason.
//
// They are typed into the composer rather than set in a form, because the tab has no controls: `remember`
// and `forget` are the same words a person would use, and a rule the user can see is a rule they can
// check.

import { MAX_INSTRUCTIONS } from './metrics.js';
import { usablePair } from './view.js';
import type { VisualizationRecord } from './store.js';
import type { VisualizationTurnView } from '../protocol.js';

// A rule is the word, a colon, and the rest. The colon is required rather than optional because a message
// that happens to begin 'remember the first deploy of the day' is a question, and silently swallowing a
// question is a worse failure than asking somebody to type one more character.
const REMEMBER = /^remember\s*:\s*(\S.*)$/isu;
const FORGET = /^forget\s*:\s*(\S.*)$/isu;

export type Instruction =
  | { kind: 'say'; rule: string }
  | { kind: 'learn'; rule: string }
  | { kind: 'message' };

// The longest a rule can be, because it is quoted into every prompt and into a line on the screen. A
// paragraph is a rule; an essay is a message.
const MAX_RULE = 240;

export function readInstruction(message: string): Instruction {
  const text = message.trim();
  const learned = REMEMBER.exec(text);
  if (learned) {
    const rule = learned[1]?.trim() ?? '';
    return rule === '' || rule.length > MAX_RULE
      ? { kind: 'message' }
      : { kind: 'learn', rule };
  }
  const forgotten = FORGET.exec(text);
  if (forgotten) {
    const rule = forgotten[1]?.trim() ?? '';
    return rule === '' || rule.length > MAX_RULE
      ? { kind: 'message' }
      : { kind: 'say', rule };
  }
  return { kind: 'message' };
}

// A rule added, or removed. Removal is by containment rather than by equality because a user forgetting
// 'use the median' will not retype the rule exactly as it was written, and a forget that matched
// nothing would leave the user believing it had.
export function learn(rules: string[], rule: string): string[] {
  const kept = rules.filter((one) => one !== rule);
  return kept.includes(rule) ? kept : [...kept, rule].slice(-MAX_INSTRUCTIONS);
}

export function forget(rules: string[], rule: string): string[] {
  return rules.filter((one) => !one.toLowerCase().includes(rule.toLowerCase()));
}

// A rule applied, and the turn that answers it. The answer is a turn rather than a silent change so it
// travels into the next prompt: a rule the host applied quietly is a rule the user has no way to check,
// and one they cannot check is one they will not trust.
export function applied(record: VisualizationRecord, instruction: Exclude<Instruction, { kind: 'message' }>): void {
  const learned = instruction.kind === 'learn';
  const already = record.instructions.includes(instruction.rule);
  record.instructions = learned
    ? learn(record.instructions, instruction.rule)
    : forget(record.instructions, instruction.rule);
  const said = record.instructions.includes(instruction.rule);
  const query = `${learned ? 'remember' : 'forget'}: ${instruction.rule}`;
  const response = learned
    ? (already
      ? `I will keep that: "${instruction.rule}".`
      : `I will remember that from now on. It is already one of mine, so nothing changed.`)
    : (said
      ? `There is nothing remembered that says "${instruction.rule}".`
      : `I will forget it. Still remembered: ${remaining(record.instructions)}.`);
  const turn: VisualizationTurnView = { query, response, pair: usablePair(record.pair) };
  record.turns = [...record.turns, turn];
}

function remaining(rules: readonly string[]): string {
  return rules.length === 0 ? 'nothing' : rules.map((one) => `"${one}"`).join(', ');
}
