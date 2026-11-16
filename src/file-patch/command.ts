import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { displayPath } from '../file-write/messages.js';
import { isRecord } from '../value-guards.js';
import { parsePatchText } from './parse.js';
import type { PatchSection } from './parse.js';

export const FILE_PATCH_USAGE = 'Usage: file patch <JSON>';
const PATCH_TOO_LARGE = 'Patch too large (>5 MB). No files were changed.';

export function isFilePatchCommandLine(line: string): boolean {
  return /^file\s+patch(\s|$)/i.test(line);
}

function extractArgument(input: string): string | undefined {
  const trimmed = input.trim();
  const match = /^file\s+patch(?:\s|$)/i.exec(trimmed);
  return match ? trimmed.slice(match[0].length).trimStart() : undefined;
}

function readPatchText(argument: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(argument);
    if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, 'patchText')) return undefined;
    return typeof parsed.patchText === 'string' ? parsed.patchText : undefined;
  } catch {
    return undefined;
  }
}

export function parseFilePatchCommand(input: string): { patchText: string } | { error: string } {
  const argument = extractArgument(input);
  if (argument === undefined) return { error: FILE_PATCH_USAGE };
  const patchText = readPatchText(argument);
  if (patchText === undefined) return { error: FILE_PATCH_USAGE };
  if (Buffer.byteLength(argument, 'utf8') > FILE_POLICY_MAX_BYTES) return { error: PATCH_TOO_LARGE };
  return { patchText };
}

function describeSection(section: PatchSection): string {
  const path = displayPath(section.path);
  return section.kind === 'update' && section.moveTo !== undefined
    ? `${path} -> ${displayPath(section.moveTo)}` : path;
}

export function describePatchCommand(input: string): string {
  if (extractArgument(input) === undefined) return input;
  const command = parseFilePatchCommand(input);
  if ('error' in command) return 'file patch';
  const patch = parsePatchText(command.patchText);
  if ('error' in patch) return 'file patch';
  return `file patch ${patch.sections.map((section) => describeSection(section)).join(', ')}`;
}
