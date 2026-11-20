import { requireString, stringValue } from './argument-checks.js';
import { headTail } from '../../file-head-tail/head-tail-core.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { decodeLineCount, validLineCount } from './head-tail-support.js';

export const headLinesOperation = descriptorFor<'head-lines'>()({
  valid: (args) => stringValue(args.path) && validLineCount(args.count),
  decode: (args) => ({ path: requireString(args.path), count: decodeLineCount(args) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['head-lines'],
  run: (context, args) => ({
    text: headTail(context.root, { direction: 'head', path: args.path, count: args.count }),
  }),
});
