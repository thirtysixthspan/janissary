export function prettyJson(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return undefined;
  }
}

export type ParsedToolCallParameter = { name: string; value: string };
export type ParsedToolCall = { name: string; parameters: ParsedToolCallParameter[] };
export type ActivitySegment =
  | { kind: 'text'; text: string }
  | { kind: 'tool-call'; calls: ParsedToolCall[] };

const FUNCTION_CALLS = /<function_calls>([\s\S]*?)<\/function_calls>/g;
const INVOKE = /<invoke\s+name="([^"]*)">\s*([\s\S]*?)<\/invoke>/g;
const PARAMETER = /<parameter\s+name="([^"]*)">([\s\S]*?)<\/parameter>/g;

const ENTITIES: Record<string, string> = {
  '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&',
};

function decodeEntities(value: string): string {
  return value.replaceAll(/&(?:quot|apos|lt|gt|amp);/g, (entity) => ENTITIES[entity] ?? entity);
}

function toolCallsIn(block: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  for (const invoke of block.matchAll(INVOKE)) {
    const parameters = Array.from(invoke[2].matchAll(PARAMETER), (parameter) => ({
      name: parameter[1], value: decodeEntities(parameter[2]),
    }));
    calls.push({ name: invoke[1], parameters });
  }
  return calls;
}

export function parseToolCalls(text: string): ActivitySegment[] {
  const segments: ActivitySegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(FUNCTION_CALLS)) {
    const calls = toolCallsIn(match[1]);
    if (calls.length === 0) continue;
    const start = match.index;
    if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) });
    segments.push({ kind: 'tool-call', calls });
    cursor = start + match[0].length;
  }
  if (cursor === 0) return [{ kind: 'text', text }];
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}
