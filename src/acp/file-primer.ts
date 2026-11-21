import { commandExample } from './command-example.js';
import { FILE_GLOB_PRIMER } from '../file-glob/command.js';
import { FILE_GREP_PRIMER } from '../file-grep/command.js';
import { FILE_PATCH_PRIMER } from '../file-patch/command.js';
import { FILE_READ_PRIMER } from '../file-read/command.js';
import { FILE_MUTATION_PRIMER } from '../file-write/command.js';

export const FILE_LIST_PRIMER = [
  'To list a directory in the workspace, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block.',
  'file list <path>',
  'Paths are relative to the workspace root. The output is one row per entry with its size, modified time, and mode. `file ls` is an accepted alias.',
  'Example:',
  commandExample('file list config'),
].join('\n');

export const FILE_STAT_PRIMER = [
  'To inspect one workspace file or directory, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block.',
  'file stat <path>',
  'Paths are relative to the workspace root. The output is one row with the entry name, size, modified time, and mode.',
  'Example:',
  commandExample('file stat config/settings.json'),
].join('\n');

export const FILE_EXISTS_PRIMER = [
  'To check whether a workspace path exists and what kind it is, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block.',
  'file exists <path>',
  'Paths are relative to the workspace root. The output is `file`, `dir`, `link`, or `missing`.',
  'Example:',
  commandExample('file exists README.md'),
].join('\n');

export const FILE_HEAD_PRIMER = [
  'To read the first lines of a workspace file, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block.',
  'file head <path> [-n <lines>]',
  'Paths are relative to the workspace root. The default is 10 lines.',
  'Example:',
  commandExample('file head README.md -n 20'),
].join('\n');

export const FILE_TAIL_PRIMER = [
  'To read the last lines of a workspace file, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block.',
  'file tail <path> [-n <lines>]',
  'Paths are relative to the workspace root. The default is 10 lines.',
  'Example:',
  commandExample('file tail server.log -n 20'),
].join('\n');

export function filePrimer(allowed: readonly string[]): string {
  return [
    ...(allowed.includes('file read') ? [FILE_READ_PRIMER] : []),
    ...(allowed.includes('file glob') ? [FILE_GLOB_PRIMER] : []),
    ...(allowed.includes('file grep') ? [FILE_GREP_PRIMER] : []),
    ...(allowed.includes('file write') || allowed.includes('file edit') ? [FILE_MUTATION_PRIMER] : []),
    ...(allowed.includes('file patch') ? [FILE_PATCH_PRIMER] : []),
    ...(allowed.includes('file list') ? [FILE_LIST_PRIMER] : []),
    ...(allowed.includes('file stat') ? [FILE_STAT_PRIMER] : []),
    ...(allowed.includes('file exists') ? [FILE_EXISTS_PRIMER] : []),
    ...(allowed.includes('file head') ? [FILE_HEAD_PRIMER] : []),
    ...(allowed.includes('file tail') ? [FILE_TAIL_PRIMER] : []),
  ].join('\n\n');
}
