import {
  history, historyPaths, nonEmptyString, optionalPolicy, stringArray, stringValue, policy,
} from './filesystem-argument-checks.js';
import {
  refusedDeleteMany, refusedItem, refusedMoveMany, refusedPaste, refusedReplay,
} from './filesystem-refusal-shapes.js';
import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from './protocol.js';
import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
import type { MaybePromise } from '../maybe-promise.js';
import type { HistoryStep } from '../file-navigator/moves.js';

// What an operation's `run` reaches, handed over as one value so the table stays a plain data
// module: `root` and `filesystem` are the far side's own, and the rest are bound closures over the
// server's session bookkeeping, which stays private to it.
export type OperationContext = {
  root: string;
  filesystem: FileSystemPort;
  watch: (relPath: string) => MaybePromise<unknown>;
  unwatch: (relPath: string) => unknown;
  git: () => Promise<unknown>;
  readFile: (relPath: string) => Promise<{ content: string }>;
  pasteSources: (args: RemoteFilesystemArguments) => string[];
};

export type OperationDescriptor = {
  // Whether a decoded-but-unvalidated argument record is acceptable for this operation.
  valid: (args: Record<string, unknown>) => boolean;
  // The arguments this operation carries, and only those — anything else the client sent is dropped.
  decode: (args: Record<string, unknown>) => RemoteFilesystemArguments;
  // Every path these arguments name, for the workspace-containment check. Written per operation
  // rather than falling through to a shared guess: an operation with no extractor of its own would
  // otherwise pass containment without a single path being tested.
  paths: (args: RemoteFilesystemArguments) => string[];
  // Set when an empty path means the workspace root itself rather than an unnamed path.
  rootDestination?: true;
  // How a containment refusal is answered. Absent when this operation's result — directory entries,
  // stats, file content — has nowhere to put a reason, in which case it is refused as an error.
  refusal?: (args: RemoteFilesystemArguments, attempted: string[]) => unknown;
  run: (context: OperationContext, args: RemoteFilesystemArguments) => MaybePromise<unknown>;
};

const pathOnly = (args: Record<string, unknown>) => ({ path: args.path as string });
const namedPath = (args: RemoteFilesystemArguments) => [args.path ?? ''];
const destinationOnly = (args: Record<string, unknown>) => ({ destination: args.destination as string });
const namedDestination = (args: RemoteFilesystemArguments) => [args.destination ?? ''];
const noArguments = { valid: (args: Record<string, unknown>) => Object.keys(args).length === 0, decode: () => ({}), paths: () => [] };

// The operations that only read. None of them can express a refusal in its own result, so none
// names one.
const READ_OPERATIONS = {
  'read-directory': {
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, rootDestination: true,
    run: (context, args) => context.filesystem.readDirectory(context.root, args.path ?? ''),
  },
  stat: {
    valid: (args) => stringArray(args.paths),
    decode: (args) => ({ paths: args.paths as string[] }),
    paths: (args) => args.paths ?? [],
    run: (context, args) => context.filesystem.statRows(context.root, args.paths ?? []),
  },
  watch: {
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, rootDestination: true,
    run: (context, args) => context.watch(args.path ?? ''),
  },
  unwatch: {
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, rootDestination: true,
    run: (context, args) => context.unwatch(args.path ?? ''),
  },
  git: { ...noArguments, run: (context) => context.git() },
  // Pulls the far side's own workspace root — no path arguments, so nothing to contain. The
  // rejection (git's own error) travels back as the request's error reply.
  'git-pull': { ...noArguments, run: (context) => context.filesystem.pull(context.root) },
  search: { ...noArguments, run: (context) => context.filesystem.search(context.root) },
  'read-file': {
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath,
    run: (context, args) => context.readFile(args.path ?? ''),
  },
} as const satisfies Record<string, OperationDescriptor>;

// The operations that write. Each names the refusal shape matching its own result type.
const MUTATION_OPERATIONS = {
  'write-file': {
    valid: (args) => stringValue(args.path) && stringValue(args.content),
    decode: (args) => ({ path: args.path as string, content: args.content as string }),
    paths: namedPath, refusal: refusedItem,
    run: (context, args) => context.filesystem.writeFile(
      context.root, args.path ?? '', Buffer.from(args.content ?? '', 'base64'),
    ),
  },
  move: {
    valid: (args) => stringValue(args.from) && stringValue(args.to),
    decode: (args) => ({ from: args.from as string, to: args.to as string }),
    paths: (args) => [args.from ?? '', args.to ?? ''],
    rootDestination: true, refusal: refusedItem,
    run: (context, args) => context.filesystem.move(context.root, args.from ?? '', args.to ?? ''),
  },
  'move-many': {
    valid: (args) => stringArray(args.sources) && stringValue(args.destination) && policy(args.policy),
    decode: (args) => ({
      sources: args.sources as string[], destination: args.destination as string,
      ...optionalPolicy(args.policy),
    }),
    paths: (args) => [...(args.sources ?? []), args.destination ?? ''],
    rootDestination: true, refusal: refusedMoveMany,
    run: (context, args) => context.filesystem.moveMany(
      context.root, args.sources ?? [], args.destination ?? '', args.policy,
    ),
  },
  delete: {
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, refusal: refusedItem,
    run: (context, args) => context.filesystem.delete(context.root, args.path ?? ''),
  },
  'delete-many': {
    valid: (args) => stringArray(args.paths),
    decode: (args) => ({ paths: args.paths as string[] }),
    paths: (args) => args.paths ?? [],
    refusal: refusedDeleteMany,
    run: (context, args) => context.filesystem.deleteMany(context.root, args.paths ?? []),
  },
  rename: {
    valid: (args) => stringValue(args.path) && nonEmptyString(args.name),
    decode: (args) => ({ path: args.path as string, name: args.name as string }),
    paths: namedPath, refusal: refusedItem,
    run: (context, args) => context.filesystem.rename(context.root, args.path ?? '', args.name ?? ''),
  },
  paste: {
    valid: (args) => stringArray(args.sources) && stringValue(args.destination)
      && (args.mode === 'copy' || args.mode === 'cut') && policy(args.policy),
    decode: (args) => ({
      sources: args.sources as string[], destination: args.destination as string,
      mode: args.mode as 'copy' | 'cut', ...optionalPolicy(args.policy),
    }),
    paths: (args) => [...(args.sources ?? []), args.destination ?? ''],
    rootDestination: true, refusal: refusedPaste,
    run: (context, args) => context.filesystem.paste(
      context.root, context.pasteSources(args), args.destination ?? '', args.mode ?? 'copy', args.policy,
    ),
  },
  'create-file': {
    valid: (args) => stringValue(args.destination),
    decode: destinationOnly, paths: namedDestination,
    rootDestination: true, refusal: refusedItem,
    run: (context, args) => context.filesystem.createFile(context.root, args.destination ?? ''),
  },
  'create-directory': {
    valid: (args) => stringValue(args.destination),
    decode: destinationOnly, paths: namedDestination,
    rootDestination: true, refusal: refusedItem,
    run: (context, args) => context.filesystem.createDirectory(context.root, args.destination ?? ''),
  },
  replay: {
    valid: (args) => history(args.undoStack) && history(args.redoStack)
      && (args.direction === 'undo' || args.direction === 'redo')
      && typeof args.overwrite === 'boolean' && typeof args.skipConflicts === 'boolean',
    decode: (args) => ({
      undoStack: args.undoStack as unknown[], redoStack: args.redoStack as unknown[],
      direction: args.direction as 'undo' | 'redo', overwrite: args.overwrite as boolean,
      skipConflicts: args.skipConflicts as boolean,
    }),
    paths: (args) => historyPaths([...(args.undoStack ?? []), ...(args.redoStack ?? [])] as HistoryStep[]),
    refusal: refusedReplay,
    run: (context, args) => context.filesystem.replay(
      context.root, args.undoStack as HistoryStep[], args.redoStack as HistoryStep[],
      args.direction ?? 'undo', args.overwrite ?? false, args.skipConflicts ?? false,
    ),
  },
} as const satisfies Record<string, OperationDescriptor>;

// One entry per operation: its argument validator, its decoder, its path extractor, how a refusal is
// answered, and what it dispatches to. The `satisfies` is the guarantee — adding a member to
// `RemoteFilesystemOperation` without an entry here fails the build, and every consumer reads this
// table rather than restating the list of operations for itself.
export const FILESYSTEM_OPERATIONS = {
  ...READ_OPERATIONS,
  ...MUTATION_OPERATIONS,
} satisfies Record<RemoteFilesystemOperation, OperationDescriptor>;

export function isFilesystemOperation(value: unknown): value is RemoteFilesystemOperation {
  return typeof value === 'string' && Object.hasOwn(FILESYSTEM_OPERATIONS, value);
}

export function operationDescriptor(operation: RemoteFilesystemOperation): OperationDescriptor {
  return FILESYSTEM_OPERATIONS[operation];
}
