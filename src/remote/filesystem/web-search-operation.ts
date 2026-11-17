import {
  boundedInteger, requireBoundedInteger, requireString, stringValue,
} from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { nonEmptyString } from '../frame/decode-shared.js';
import {
  WEB_SEARCH_MAX_CHARS, WEB_SEARCH_MAX_RESULTS, WEB_SEARCH_MIN_CHARS, WEB_SEARCH_MIN_RESULTS,
  type WebSearchDepth,
} from '../../web/search/command.js';
import { webSearch } from '../../web/search/search.js';

const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';

function depthValue(value: unknown): value is WebSearchDepth {
  return value === 'basic' || value === 'advanced';
}

function requireDepth(value: unknown): WebSearchDepth {
  if (!depthValue(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

export const webSearchOperation = descriptorFor<'web-search'>()({
  valid: (args) => nonEmptyString(args.query) && stringValue(args.provider)
    && boundedInteger(args.numResults, WEB_SEARCH_MIN_RESULTS, WEB_SEARCH_MAX_RESULTS)
    && boundedInteger(args.maxChars, WEB_SEARCH_MIN_CHARS, WEB_SEARCH_MAX_CHARS)
    && depthValue(args.depth),
  decode: (args) => ({
    query: requireString(args.query),
    numResults: requireBoundedInteger(args.numResults, WEB_SEARCH_MIN_RESULTS, WEB_SEARCH_MAX_RESULTS),
    maxChars: requireBoundedInteger(args.maxChars, WEB_SEARCH_MIN_CHARS, WEB_SEARCH_MAX_CHARS),
    depth: requireDepth(args.depth),
    provider: requireString(args.provider),
  }),
  paths: () => [],
  decodeResult: resultDecoders['web-search'],
  run: async (context, args) => ({ text: await webSearch(args, { tokens: context.tokens, fetch }) }),
});
