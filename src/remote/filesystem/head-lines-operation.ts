import { requireString, stringValue } from './argument-checks.js';
import { checkLexicalPath } from '../../file-read/policy.js';
import { readWorkspaceLines } from '../../file-read/read.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { decodeLineCount, directoryFailureLine, validLineCount } from './head-tail-support.js';

export const headLinesOperation = descriptorFor<'head-lines'>()({
  valid: (args) => stringValue(args.path) && validLineCount(args.count),
  decode: (args) => ({ path: requireString(args.path), count: decodeLineCount(args) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['head-lines'],
  run: (context, args) => {
    const lexicalFailure = checkLexicalPath(context.root, args.path);
    if (lexicalFailure === undefined) {
      const failure = directoryFailureLine(context.root, args.path);
      if (failure !== undefined) return { text: failure };
    }
    return { text: readWorkspaceLines(context.root, { path: args.path, offset: 1, limit: args.count }) };
  },
});
