import { decodeBase64Text, requireBase64Text, requireBoolean, requireString, stringValue } from './argument-checks.js';
import { refusedItem } from './refusal-shapes.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { editToolTextFile } from '../../file-write/edit.js';

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
