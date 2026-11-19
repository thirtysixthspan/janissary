import { requireString, stringValue } from './argument-checks.js';
import { fileExists } from '../../file-exists/exists-core.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

export const pathExistsOperation = descriptorFor<'path-exists'>()({
  valid: (args) => stringValue(args.path),
  decode: (args) => ({ path: requireString(args.path) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['path-exists'],
  run: (context, args) => ({ text: fileExists(context.root, args.path) }),
});
