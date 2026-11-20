import { requireString, stringValue } from './argument-checks.js';
import { statFile } from '../../file-stat/stat-core.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

export const statPathOperation = descriptorFor<'stat-path'>()({
  valid: (args) => stringValue(args.path),
  decode: (args) => ({ path: requireString(args.path) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['stat-path'],
  run: async (context, args) => ({ text: await statFile(context.root, args.path, context.filesystem) }),
});
