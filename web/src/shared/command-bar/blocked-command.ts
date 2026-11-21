import { isCloseCommand } from '@shared/commands/parse-close';
import type { CommandBarVerdict } from './classify-submit';

function blockedCommandWord(line: string, closeVerdict: boolean): 'quit' | 'close' {
  return closeVerdict || isCloseCommand(line.trim().replace(/^\//u, '')) ? 'close' : 'quit';
}

export function consumeBlockedCommand(
  line: string,
  verdict: CommandBarVerdict,
  tab: string | undefined,
  report: ((text: string, tab: string) => void) | undefined,
): boolean {
  if (verdict.kind !== 'confirm-quit' && verdict.kind !== 'confirm-close') return false;
  if (tab !== undefined) report?.(blockedCommandWord(line, verdict.kind === 'confirm-close'), tab);
  return true;
}
