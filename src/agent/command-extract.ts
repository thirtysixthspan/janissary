import { closesFence, openingFence, type CodeFence } from '../acp/command-block.js';

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

