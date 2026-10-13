import { stringValue } from './argument-checks.js';
import { refusedItem } from './refusal-shapes.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

export const writeFileOperation = descriptorFor<'write-file'>()({
  valid: (args) => stringValue(args.path) && stringValue(args.content)
    && (args.expectedHash === undefined || stringValue(args.expectedHash)),
  decode: (args) => ({
    path: args.path as string, content: args.content as string,
    ...(args.expectedHash !== undefined && { expectedHash: args.expectedHash as string }),
  }),
  paths: (args) => [args.path], refusal: refusedItem,
  decodeResult: resultDecoders['write-file'],
  run: (context, args) => context.filesystem.writeFile(
    context.root, args.path, Buffer.from(args.content, 'base64'), args.expectedHash,
  ),
});
