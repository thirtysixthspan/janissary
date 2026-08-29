import type {
  RemoteFilesystemArguments,
  RemoteFilesystemOperation,
  RemoteFrame,
} from './protocol.js';

type DecodeResult = RemoteFrame | { error: string };

const OPERATIONS = new Set<RemoteFilesystemOperation>([
  'read-directory', 'stat', 'watch', 'unwatch', 'git', 'search', 'read-file', 'write-file',
  'move', 'move-many', 'delete', 'delete-many', 'rename', 'paste',
  'create-file', 'create-directory',
  'replay',
]);

function malformed(type: string): DecodeResult {
  return { error: `Malformed remote frame "${type}".` };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stringValue(value: unknown): value is string {
  return typeof value === 'string';
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function policy(value: unknown): boolean {
  return value === undefined || ['overwrite-all', 'skip-conflicts'].includes(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function moveEntry(value: unknown): boolean {
  return isRecord(value) && stringValue(value.from) && stringValue(value.to);
}

function historyStep(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value.entries)) return value.entries.every((entry) => moveEntry(entry));
  return (value.mode === 'copy' || value.mode === 'cut')
    && Array.isArray(value.pairs) && value.pairs.every((pair) => moveEntry(pair));
}

function history(value: unknown): boolean {
  return Array.isArray(value) && value.every((step) => historyStep(step));
}

function validArguments(operation: RemoteFilesystemOperation, args: Record<string, unknown>): boolean {
  switch (operation) {
  case 'read-directory':
  case 'read-file':
  case 'delete':
  case 'watch':
  case 'unwatch': { return stringValue(args.path); }
  case 'stat':
  case 'delete-many': { return stringArray(args.paths); }
  case 'git':
  case 'search': { return Object.keys(args).length === 0; }
  case 'write-file': { return stringValue(args.path) && stringValue(args.content); }
  case 'move': { return stringValue(args.from) && stringValue(args.to); }
  case 'move-many': {
    return stringArray(args.sources) && stringValue(args.destination) && policy(args.policy);
  }
  case 'rename': { return stringValue(args.path) && nonEmptyString(args.name); }
  case 'paste': {
    return stringArray(args.sources) && stringValue(args.destination)
      && (args.mode === 'copy' || args.mode === 'cut') && policy(args.policy);
  }
  case 'create-file':
  case 'create-directory': { return stringValue(args.destination); }
  case 'replay': {
    return history(args.undoStack) && history(args.redoStack)
      && (args.direction === 'undo' || args.direction === 'redo')
      && typeof args.overwrite === 'boolean' && typeof args.skipConflicts === 'boolean';
  }
  }
}

function decodeRequest(record: Record<string, unknown>): DecodeResult {
  const operation = record.operation;
  if (!nonEmptyString(record.session) || !nonEmptyString(record.request)
    || typeof operation !== 'string' || !OPERATIONS.has(operation as RemoteFilesystemOperation)
    || !isRecord(record.args)
    || !validArguments(operation as RemoteFilesystemOperation, record.args)) return malformed('filesystem-request');
  const args = decodedArguments(operation as RemoteFilesystemOperation, record.args);
  if (operation === 'write-file') args.content = Buffer.from(args.content ?? '', 'base64').toString('utf8');
  return {
    type: 'filesystem-request', session: record.session, request: record.request,
    operation: operation as RemoteFilesystemOperation, args,
  };
}

function decodedArguments(
  operation: RemoteFilesystemOperation, args: Record<string, unknown>,
): RemoteFilesystemArguments {
  switch (operation) {
  case 'read-directory':
  case 'read-file':
  case 'delete':
  case 'watch':
  case 'unwatch': { return { path: args.path as string }; }
  case 'stat':
  case 'delete-many': { return { paths: args.paths as string[] }; }
  case 'git':
  case 'search': { return {}; }
  case 'write-file': { return { path: args.path as string, content: args.content as string }; }
  case 'move': { return { from: args.from as string, to: args.to as string }; }
  case 'move-many': {
    return {
      sources: args.sources as string[], destination: args.destination as string,
      ...(args.policy !== undefined && { policy: args.policy as RemoteFilesystemArguments['policy'] }),
    };
  }
  case 'rename': { return { path: args.path as string, name: args.name as string }; }
  case 'paste': {
    return {
      sources: args.sources as string[], destination: args.destination as string,
      mode: args.mode as 'copy' | 'cut',
      ...(args.policy !== undefined && { policy: args.policy as RemoteFilesystemArguments['policy'] }),
    };
  }
  case 'create-file':
  case 'create-directory': { return { destination: args.destination as string }; }
  case 'replay': {
    return {
      undoStack: args.undoStack as unknown[], redoStack: args.redoStack as unknown[],
      direction: args.direction as 'undo' | 'redo', overwrite: args.overwrite as boolean,
      skipConflicts: args.skipConflicts as boolean,
    };
  }
  }
}

function decodeReply(record: Record<string, unknown>): DecodeResult {
  const hasResult = Object.hasOwn(record, 'result');
  const hasError = Object.hasOwn(record, 'error');
  if (!nonEmptyString(record.session) || !nonEmptyString(record.request)
    || hasResult === hasError || (hasError && !nonEmptyString(record.error))) return malformed('filesystem-reply');
  if (hasError) {
    return { type: 'filesystem-reply', session: record.session, request: record.request, error: record.error as string };
  }
  return {
    type: 'filesystem-reply', session: record.session, request: record.request,
    result: decodeContentResult(record.result),
  };
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

function decodeContentResult(value: unknown): unknown {
  if (!isRecord(value) || typeof value.content !== 'string') return value;
  return { ...value, content: Buffer.from(value.content, 'base64').toString('utf8') };
}
