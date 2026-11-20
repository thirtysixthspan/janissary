import { FILE_HEAD_TAIL_MAX_LINES } from '../../file-head-tail/command.js';
import { boundedInteger, requireBoundedInteger } from './argument-checks.js';

export function validLineCount(value: unknown): boolean {
  return boundedInteger(value, 1, FILE_HEAD_TAIL_MAX_LINES);
}

export function decodeLineCount(args: Record<string, unknown>): number {
  return requireBoundedInteger(args.count, 1, FILE_HEAD_TAIL_MAX_LINES);
}
