import { requireString, stringValue } from './argument-checks.js';
import { listFiles } from '../../file-list/list-core.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

export const listDirectoryOperation = descriptorFor<'list-directory'>()({
  valid: (args) => stringValue(args.path),
  decode: (args) => ({ path: requireString(args.path) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['list-directory'],
  run: async (context, args) => ({ text: await listFiles(context.root, args.path, context.filesystem) }),
});
