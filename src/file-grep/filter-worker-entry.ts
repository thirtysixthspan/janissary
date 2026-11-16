import { parentPort, workerData } from 'node:worker_threads';
import { filterPaths } from '../search/filter-paths.js';
import { isRecord } from '../value-guards.js';
import type { GrepFilterRequest, GrepFilterResponse } from './filter-worker-protocol.js';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isGrepFilterRequest(value: unknown): value is GrepFilterRequest {
  return isRecord(value)
    && isStringArray(value.paths)
    && typeof value.include === 'string'
    && typeof value.exclude === 'string';
}

const request: unknown = workerData;

if (!isGrepFilterRequest(request)) throw new Error('File grep filter request is invalid');

const response: GrepFilterResponse = { paths: filterPaths(request.paths, request.include, request.exclude) };
parentPort?.postMessage(response);
