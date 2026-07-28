import { asRecord, asString, asArray } from './json.js';
import { speech, toolCall, toolResult, renderValue, contentText } from './render.js';

// Each harness's own record kinds rendered into the shared text vocabulary of `render.ts`. Records
// that carry nothing a reader would want — claude's `mode` and `file-history-snapshot` bookkeeping,
// codex's `session_meta`/`turn_context` — are dropped rather than rendered as empty blocks.
//
// A tool's result arrives as its own record, separated from the call that names the tool, so each
// adapter carries a `ToolNames` map from call id to tool name and hands it in on every record. The
// map is the adapter's, not this module's, so these functions stay free of session state.
export type ToolNames = Map<string, string>;

const UNNAMED_TOOL = 'tool';
const THINKING = ' (thinking)';

// codex's session-level bookkeeping kinds: they describe the session rather than carry any of its
// conversation, so they never render.
const CODEX_BOOKKEEPING = new Set(['session_meta', 'turn_context', 'event_msg']);

export function normalizeClaudeRecord(record: Record<string, unknown>, toolNames: ToolNames): string | undefined {
  const type = asString(record.type);
  if (type === 'mode' || type === 'file-history-snapshot') return undefined;
  if (type === 'summary') return speech('summary', asString(record.summary) ?? '');
  const message = asRecord(record.message);
  if (!message) return undefined;
  const actor = asString(message.role) ?? type ?? 'unknown';
  const blocks = claudeBlocks(message.content, actor, toolNames);
  return blocks.length > 0 ? blocks.join('\n') : undefined;
}

// A message's content is either a bare string or a list of typed blocks; both render to the same
// list of lines.
function claudeBlocks(content: unknown, actor: string, toolNames: ToolNames): string[] {
  const direct = asString(content);
  if (direct !== undefined) {
    const line = speech(actor, direct);
    return line ? [line] : [];
  }
  const rendered: string[] = [];
  for (const raw of asArray(content)) {
    const block = asRecord(raw);
    const line = block && claudeBlock(block, actor, toolNames);
    if (line) rendered.push(line);
  }
  return rendered;
}

function claudeBlock(block: Record<string, unknown>, actor: string, toolNames: ToolNames): string | undefined {
  switch (asString(block.type)) {
    case 'text': { return speech(actor, asString(block.text) ?? ''); }
    case 'thinking': { return speech(actor + THINKING, asString(block.thinking) ?? ''); }
    case 'tool_use': {
      const name = asString(block.name) ?? UNNAMED_TOOL;
      const id = asString(block.id);
      if (id) toolNames.set(id, name);
      return toolCall(actor, name, block.input);
    }
    case 'tool_result': {
      return toolResult(toolNames.get(asString(block.tool_use_id) ?? '') ?? UNNAMED_TOOL, contentText(block.content));
    }
    default: { return undefined; }
  }
}

// A codex rollout line wraps the interesting record in `payload`; the outer `type` marks the
// session-level bookkeeping kinds that carry no conversation content.
export function normalizeCodexRecord(record: Record<string, unknown>, toolNames: ToolNames): string | undefined {
  if (CODEX_BOOKKEEPING.has(asString(record.type) ?? '')) return undefined;
  const payload = asRecord(record.payload);
  if (!payload) return undefined;
  switch (asString(payload.type)) {
    case 'message': { return speech(asString(payload.role) ?? 'assistant', contentText(payload.content)); }
    case 'reasoning': { return speech('assistant' + THINKING, contentText(payload.summary)); }
    case 'function_call': {
      const name = asString(payload.name) ?? UNNAMED_TOOL;
      const id = asString(payload.call_id);
      if (id) toolNames.set(id, name);
      return toolCall('assistant', name, payload.arguments);
    }
    case 'function_call_output': {
      return toolResult(toolNames.get(asString(payload.call_id) ?? '') ?? UNNAMED_TOOL, renderValue(payload.output));
    }
    default: { return undefined; }
  }
}

// opencode stores a message's content as `part` rows rather than as one record, so its unit of
// normalization is a single part read with the role of the message that owns it. A tool part holds
// both its input and its output, so it renders as the call and its result together.
export function normalizeOpencodePart(part: Record<string, unknown>, role: string): string | undefined {
  switch (asString(part.type)) {
    case 'text': { return speech(role, asString(part.text) ?? ''); }
    case 'reasoning': { return speech(role + THINKING, asString(part.text) ?? ''); }
    case 'tool': {
      const name = asString(part.tool) ?? UNNAMED_TOOL;
      const state = asRecord(part.state);
      const call = toolCall(role, name, state?.input);
      const output = asString(state?.output);
      return output ? `${call}\n${toolResult(name, output)}` : call;
    }
    default: { return undefined; }
  }
}
