import { parentPort } from 'node:worker_threads';
import { compileMatcher } from './compile-matcher.js';
import { fileMatches, matchFile } from './search-files.js';
import type { MatcherWorkerRequest, MatcherWorkerResponse } from './matcher-worker-protocol.js';

let matcherKey = '';
let matcher = null as ReturnType<typeof compileMatcher>;

function execute(request: MatcherWorkerRequest): MatcherWorkerResponse {
  const key = JSON.stringify([request.query, request.modes]);
  if (key !== matcherKey) {
    matcherKey = key;
    matcher = compileMatcher(request.query, request.modes);
  }
  if (matcher === null) {
    return { id: request.id, result: request.operation === 'detect' ? false : [] };
  }
  if (request.operation === 'detect') {
    return { id: request.id, result: fileMatches(request.lines, matcher) };
  }
  return { id: request.id, result: matchFile(request.relPath, request.text, matcher) };
}

parentPort?.on('message', (request: MatcherWorkerRequest) => {
  try {
    parentPort?.postMessage(execute(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({ id: request.id, error: message } satisfies MatcherWorkerResponse);
  }
});
