import { requireString, stringValue } from './argument-checks.js';
import { formatFileLines } from '../../file-read/format.js';
import { checkLexicalPath } from '../../file-read/policy.js';
import { readWorkspaceText } from '../../file-read/read.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { countLines, decodeLineCount, directoryFailureLine, validLineCount } from './head-tail-support.js';

export const tailLinesOperation = descriptorFor<'tail-lines'>()({
  valid: (args) => stringValue(args.path) && validLineCount(args.count),
  decode: (args) => ({ path: requireString(args.path), count: decodeLineCount(args) }),
  paths: (args) => [args.path], rootDestination: true,
  decodeResult: resultDecoders['tail-lines'],
  run: (context, args) => {
    const lexicalFailure = checkLexicalPath(context.root, args.path);
    if (lexicalFailure === undefined) {
      const failure = directoryFailureLine(context.root, args.path);
      if (failure !== undefined) return { text: failure };
    }
    const full = readWorkspaceText(context.root, args.path);
    if ('error' in full) return { text: full.error };
    const total = countLines(full.text);
    return { text: formatFileLines(full.text, {
      path: args.path, offset: Math.max(1, total - args.count + 1), limit: args.count,
    }) };
  },
});
