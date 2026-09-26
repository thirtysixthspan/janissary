import { isRecord, stringValue } from './filesystem/argument-checks.js';
import { isFilesystemOperation, operationDescriptor } from './filesystem/operations.js';
import { malformed, nonEmptyString, type DecodeResult } from './frame-decode-shared.js';

function decodeRequest(record: Record<string, unknown>): DecodeResult {
  const operation = record.operation;
  if (!nonEmptyString(record.session) || !nonEmptyString(record.request)
    || !isFilesystemOperation(operation) || !isRecord(record.args)) return malformed('filesystem-request');
  const descriptor = operationDescriptor(operation);
  if (!descriptor.valid(record.args)) return malformed('filesystem-request');
  return {
    type: 'filesystem-request', session: record.session, request: record.request, operation,
    args: descriptor.decode(record.args),
  };
}

function decodeReply(record: Record<string, unknown>): DecodeResult {
  const hasResult = Object.hasOwn(record, 'result');
  const hasError = Object.hasOwn(record, 'error');
  if (!nonEmptyString(record.session) || !nonEmptyString(record.request)
    || hasResult === hasError || (hasError && !nonEmptyString(record.error))) return malformed('filesystem-reply');
  if (hasError) {
    return { type: 'filesystem-reply', session: record.session, request: record.request, error: record.error as string };
  }
  return { type: 'filesystem-reply', session: record.session, request: record.request, result: record.result };
}

export function decodeFilesystemFrame(type: string, record: Record<string, unknown>): DecodeResult {
  if (type === 'filesystem-open' || type === 'filesystem-close') {
    return nonEmptyString(record.session) ? { type, session: record.session } : malformed(type);
  }
  if (type === 'filesystem-request') return decodeRequest(record);
  if (type === 'filesystem-reply') return decodeReply(record);
  if (type === 'filesystem-event') {
    return nonEmptyString(record.session) && stringValue(record.path)
      ? { type, session: record.session, path: record.path }
      : malformed(type);
  }
  return { error: `Unknown remote frame type "${type}".` };
}
