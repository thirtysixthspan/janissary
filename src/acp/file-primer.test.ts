import { describe, expect, it } from 'vitest';
import {
  FILE_EXISTS_PRIMER,
  FILE_HEAD_PRIMER,
  FILE_LIST_PRIMER,
  FILE_STAT_PRIMER,
  FILE_TAIL_PRIMER,
} from './file-primer.js';

describe('file command primers', () => {
  it.each([
    ['file list', FILE_LIST_PRIMER, 'file list <path>', 'file list config'],
    ['file stat', FILE_STAT_PRIMER, 'file stat <path>', 'file stat config/settings.json'],
    ['file exists', FILE_EXISTS_PRIMER, 'file exists <path>', 'file exists README.md'],
    ['file head', FILE_HEAD_PRIMER, 'file head <path> [-n <lines>]', 'file head README.md -n 20'],
    ['file tail', FILE_TAIL_PRIMER, 'file tail <path> [-n <lines>]', 'file tail server.log -n 20'],
  ])('%s names the labelled block and shows a fenced example', (_name, primer, grammar, example) => {
    expect(primer).toContain('put exactly one command inside a final fenced block whose info string is exactly `janissary`');
    expect(primer).toContain('Write the command without a `janissary` prefix; prose may follow the block.');
    expect(primer).toContain(grammar);
    expect(primer).not.toContain('end your reply with one line');
    expect(primer.split('\n').slice(-3)).toEqual(['```janissary', example, '```']);
  });
});
