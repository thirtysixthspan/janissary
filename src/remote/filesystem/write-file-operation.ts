import { requireString, stringValue } from './argument-checks.js';
import { refusedItem } from './refusal-shapes.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

export const writeFileOperation = descriptorFor<'write-file'>()({
  valid: (args) => stringValue(args.path) && stringValue(args.content)
    && (args.expectedHash === undefined || stringValue(args.expectedHash)),
  decode: (args) => ({
    path: requireString(args.path), content: requireString(args.content),
    ...(args.expectedHash !== undefined && { expectedHash: requireString(args.expectedHash) }),
  }),
  paths: (args) => [args.path], refusal: refusedItem,
  decodeResult: resultDecoders['write-file'],
  run: (context, args) => context.filesystem.writeFile(
    context.root, args.path, Buffer.from(args.content, 'base64'), args.expectedHash,
  ),
});
