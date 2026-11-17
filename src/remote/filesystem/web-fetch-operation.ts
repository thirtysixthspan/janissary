import {
  boundedInteger, requireBoundedInteger, requireString, stringValue,
} from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import {
  WEB_FETCH_MAX_CHARS, WEB_FETCH_MAX_TIMEOUT_SECONDS, WEB_FETCH_MIN_CHARS, WEB_FETCH_MIN_OFFSET,
  WEB_FETCH_MIN_TIMEOUT_SECONDS, isWebFetchFormat, isWebFetchUrl,
} from '../../web/fetch/command.js';
import type { WebFetchFormat } from '../../web/providers/contract.js';
import { webFetch } from '../../web/fetch/fetch.js';

const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';

function requireWebFetchUrl(value: unknown): string {
  if (!stringValue(value) || !isWebFetchUrl(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

function requireWebFetchFormat(value: unknown): WebFetchFormat {
  if (!isWebFetchFormat(value)) throw new Error(INVALID_ARGUMENTS);
  return value;
}

export const webFetchOperation = descriptorFor<'web-fetch'>()({
  valid: (args) => stringValue(args.url) && isWebFetchUrl(args.url)
    && isWebFetchFormat(args.format)
    && boundedInteger(args.timeoutSeconds, WEB_FETCH_MIN_TIMEOUT_SECONDS, WEB_FETCH_MAX_TIMEOUT_SECONDS)
    && boundedInteger(args.maxChars, WEB_FETCH_MIN_CHARS, WEB_FETCH_MAX_CHARS)
    && boundedInteger(args.offset, WEB_FETCH_MIN_OFFSET, Number.MAX_SAFE_INTEGER)
    && stringValue(args.provider),
  decode: (args) => ({
    url: requireWebFetchUrl(args.url),
    format: requireWebFetchFormat(args.format),
    timeoutSeconds: requireBoundedInteger(args.timeoutSeconds, WEB_FETCH_MIN_TIMEOUT_SECONDS, WEB_FETCH_MAX_TIMEOUT_SECONDS),
    maxChars: requireBoundedInteger(args.maxChars, WEB_FETCH_MIN_CHARS, WEB_FETCH_MAX_CHARS),
    offset: requireBoundedInteger(args.offset, WEB_FETCH_MIN_OFFSET, Number.MAX_SAFE_INTEGER),
    provider: requireString(args.provider),
  }),
  paths: () => [],
  decodeResult: resultDecoders['web-fetch'],
  run: async (context, args) => ({ text: await webFetch(args, { tokens: context.tokens, fetch }) }),
});
