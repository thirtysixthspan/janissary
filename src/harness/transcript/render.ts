import { asRecord, asString, asArray } from './json.js';

// The rendered vocabulary shared by all three harnesses' normalizers. Every record becomes plain
// text lines in one of these three shapes, so a monitor reading a mixed feed sees one format
// regardless of which harness produced it. Nothing here truncates — the only cap in the feature
// lives at the monitor flush boundary, and the persisted transcript is meant to be complete.

export function speech(actor: string, text: string): string | undefined {
  const body = text.trim();
  return body ? `${actor}: ${body}` : undefined;
}

export function toolCall(actor: string, name: string, input: unknown): string {
  const rendered = input === undefined ? '' : renderValue(input);
  return `${actor} → ${name}(${rendered})`;
}

export function toolResult(name: string, output: string): string {
  return `${name} result: ${output.trim()}`;
}

// A tool's input or output as compact text: strings pass through, everything else is JSON. A value
// that cannot be serialized (a cycle, a BigInt) renders as an empty argument list rather than
// throwing inside a poll tick.
export function renderValue(value: unknown): string {
  const direct = asString(value);
  if (direct !== undefined) return direct;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

// The text carried by a message-content block list, in the shape claude and codex share: an array of
// blocks each holding its text under `text`, or a bare string for the whole content. Blocks with no
// text (tool uses, images) contribute nothing here; their callers render them separately.
export function contentText(content: unknown): string {
  const direct = asString(content);
  if (direct !== undefined) return direct;
  const parts: string[] = [];
  for (const block of asArray(content)) {
    const text = asString(asRecord(block)?.text);
    if (text) parts.push(text);
  }
  return parts.join('\n');
}

// Prefix every line of a rendered block with the subagent that produced it, so a parent's and a
// subagent's activity stay distinguishable once they are interleaved in one transcript.
export function withSource(source: string | undefined, block: string): string {
  if (!source) return block;
  return block.split('\n').map((line) => `[${source}] ${line}`).join('\n');
}
