import path from 'node:path';
import { requireBoolean, requireString } from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

export const searchTextOperation = descriptorFor<'search-text'>()({
  valid: (args) => typeof args.root === 'string' && typeof args.query === 'string' && typeof args.include === 'string'
    && typeof args.exclude === 'string' && typeof args.regex === 'boolean'
    && typeof args.matchCase === 'boolean' && typeof args.wholeWord === 'boolean',
  decode: (args) => ({
      root: requireString(args.root), query: requireString(args.query),
      include: requireString(args.include), exclude: requireString(args.exclude),
    regex: requireBoolean(args.regex), matchCase: requireBoolean(args.matchCase), wholeWord: requireBoolean(args.wholeWord),
  }),
  paths: (args) => [args.root], rootDestination: true, decodeResult: resultDecoders['search-text'],
  run: (context, args) => {
    const { root, ...request } = args;
    return context.filesystem.searchText(path.join(context.root, root), request);
  },
});
