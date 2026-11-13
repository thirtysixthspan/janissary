import { requireBoolean, requireString, stringValue } from './argument-checks.js';
import { refusedItem } from './refusal-shapes.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { editToolTextFile } from '../../file-write/edit.js';

const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';

function decodeBase64Text(value: unknown): string | undefined {
  if (!stringValue(value)) return undefined;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function requireBase64Text(value: unknown): string {
  const text = decodeBase64Text(value);
  if (text === undefined) throw new Error(INVALID_ARGUMENTS);
  return text;
}

export const editFileOperation = descriptorFor<'edit-file'>()({
  valid: (args) => stringValue(args.path) && decodeBase64Text(args.oldString) !== undefined
    && decodeBase64Text(args.newString) !== undefined && typeof args.replaceAll === 'boolean',
  decode: (args) => ({
    path: requireString(args.path),
    oldString: requireBase64Text(args.oldString),
    newString: requireBase64Text(args.newString),
    replaceAll: requireBoolean(args.replaceAll),
  }),
  paths: (args) => [args.path], refusal: refusedItem,
  decodeResult: resultDecoders['edit-file'],
  run: (context, args) => editToolTextFile(context.root, args.path, args.oldString, args.newString, args.replaceAll),
});
