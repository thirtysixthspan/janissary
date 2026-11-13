type CodeFence = { character: '`' | '~'; length: number };

function openingFence(line: string): CodeFence | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  const marker = match?.[1];
  const info = match?.[2] ?? '';
  if (!marker || (marker.startsWith('`') && info.includes('`'))) return undefined;
  return { character: marker.startsWith('`') ? '`' : '~', length: marker.length };
}

function closesFence(line: string, fence: CodeFence): boolean {
  const marker = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)?.[1];
  return marker !== undefined && marker.startsWith(fence.character) && marker.length >= fence.length;
}

export function extractAgentCommand(text: string, allowQuestion: boolean): string | null {
  const lines = text.split('\n');
  let fence: CodeFence | undefined;
  let finalLine = '';
  for (const line of lines) {
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      continue;
    }
    const normalized = line.trim().replaceAll(/^`+|`+$/g, '').trim();
    if (normalized) finalLine = normalized;
  }
  if (/^janissary\s+/i.test(finalLine)) return finalLine.replace(/^janissary\s+/i, '');
  if (allowQuestion && /^question\s+(ask|approve)\b/i.test(finalLine)) return finalLine;
  return null;
}

