import path from 'node:path';
import {
  history, historyPaths, optionalPolicy, optionalRoot, stringArray, stringValue, policy,
} from './argument-checks.js';
import { nonEmptyString } from '../frame/decode-shared.js';
import {
  refusedDeleteMany, refusedItem, refusedMoveMany, refusedPaste, refusedReplay,
} from './refusal-shapes.js';
import type { RemoteFilesystemOperation } from '../protocol-frames.js';
import { descriptorFor, type OperationContext, type OperationDescriptor } from './operation-types.js';
import type { HistoryStep } from '../../file-navigator/moves.js';
import { resultDecoders } from './result-decoders.js';

// What an operation's `run` reaches, handed over as one value so the table stays a plain data
// module: `root` and `filesystem` are the far side's own, and the rest are bound closures over the
// server's session bookkeeping, which stays private to it.
const pathOnly = (args: Record<string, unknown>) => ({ path: args.path as string });
const namedPath = (args: { path?: string }) => [args.path ?? ''];
const destinationOnly = (args: Record<string, unknown>) => ({ destination: args.destination as string });
const namedDestination = (args: { destination?: string }) => [args.destination ?? ''];
const noArguments = { valid: (args: Record<string, unknown>) => Object.keys(args).length === 0, decode: () => ({}), paths: () => [] };

// The operations that only read. None of them can express a refusal in its own result, so none
// names one.
const READ_OPERATIONS = {
  'read-directory': descriptorFor<'read-directory'>()({
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, rootDestination: true,
    decodeResult: resultDecoders['read-directory'],
    run: (context, args) => context.filesystem.readDirectory(context.root, args.path),
  }),
  stat: descriptorFor<'stat'>()({
    valid: (args) => stringArray(args.paths),
    decode: (args) => ({ paths: args.paths as string[] }),
    paths: (args) => args.paths,
    decodeResult: resultDecoders.stat,
    run: (context, args) => context.filesystem.statRows(context.root, args.paths),
  }),
  watch: descriptorFor<'watch'>()({
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, rootDestination: true,
    decodeResult: resultDecoders.watch,
    run: (context, args) => context.watch(args.path),
  }),
  unwatch: descriptorFor<'unwatch'>()({
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, rootDestination: true,
    decodeResult: resultDecoders.unwatch,
    run: (context, args) => context.unwatch(args.path),
  }),
  git: descriptorFor<'git'>()({ ...noArguments, decodeResult: resultDecoders.git, run: (context: OperationContext) => context.git() }),
  // Pulls the far side's own workspace root — no path arguments, so nothing to contain. The
  // rejection (git's own error) travels back as the request's error reply.
  'git-pull': descriptorFor<'git-pull'>()({ ...noArguments, decodeResult: resultDecoders['git-pull'], run: (context: OperationContext) => context.filesystem.pull(context.root) }),
  'change-set': descriptorFor<'change-set'>()({
    valid: (args) => stringArray(args.fullFiles),
    decode: (args) => ({ fullFiles: args.fullFiles as string[] }),
    paths: () => [],
    decodeResult: resultDecoders['change-set'],
    run: (context, args) => context.filesystem.changeSet(context.root, args.fullFiles),
  }),
  search: descriptorFor<'search'>()({ ...noArguments, decodeResult: resultDecoders.search, run: (context: OperationContext) => context.filesystem.search(context.root) }),
  'read-file': descriptorFor<'read-file'>()({
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath,
    decodeResult: resultDecoders['read-file'],
    run: (context, args) => context.readFile(args.path),
  }),
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the constraint only loosens this satisfies check's variance; each entry keeps its own decoded type in `typeof FILESYSTEM_OPERATIONS`.
} as const satisfies Record<string, OperationDescriptor<any>>;

// The operations that write. Each names the refusal shape matching its own result type.
const MUTATION_OPERATIONS = {
  'write-file': descriptorFor<'write-file'>()({
    valid: (args) => stringValue(args.path) && stringValue(args.content),
    decode: (args) => ({ path: args.path as string, content: args.content as string }),
    paths: namedPath, refusal: refusedItem,
    decodeResult: resultDecoders['write-file'],
    run: (context, args) => context.filesystem.writeFile(
      context.root, args.path, Buffer.from(args.content, 'base64'),
    ),
  }),
  move: descriptorFor<'move'>()({
    valid: (args) => stringValue(args.from) && stringValue(args.to)
      && (args.overwrite === undefined || typeof args.overwrite === 'boolean'),
    decode: (args) => ({
      from: args.from as string, to: args.to as string,
      ...(args.overwrite !== undefined && { overwrite: args.overwrite as boolean }),
    }),
    paths: (args) => [args.from, args.to],
    rootDestination: true, refusal: refusedItem,
    decodeResult: resultDecoders.move,
    run: (context, args) => context.filesystem.move(context.root, args.from, args.to, args.overwrite),
  }),
  'move-many': descriptorFor<'move-many'>()({
    valid: (args) => stringArray(args.sources) && stringValue(args.destination) && policy(args.policy),
    decode: (args) => ({
      sources: args.sources as string[], destination: args.destination as string,
      ...optionalPolicy(args.policy),
    }),
    paths: (args) => [...args.sources, args.destination],
    rootDestination: true, refusal: refusedMoveMany,
    decodeResult: resultDecoders['move-many'],
    run: (context, args) => context.filesystem.moveMany(
      context.root, args.sources, args.destination, args.policy,
    ),
  }),
  delete: descriptorFor<'delete'>()({
    valid: (args) => stringValue(args.path),
    decode: pathOnly, paths: namedPath, refusal: refusedItem,
    decodeResult: resultDecoders.delete,
    run: (context, args) => context.filesystem.delete(context.root, args.path),
  }),
  'delete-many': descriptorFor<'delete-many'>()({
    valid: (args) => stringArray(args.paths),
    decode: (args) => ({ paths: args.paths as string[] }),
    paths: (args) => args.paths,
    refusal: refusedDeleteMany,
    decodeResult: resultDecoders['delete-many'],
    run: (context, args) => context.filesystem.deleteMany(context.root, args.paths),
  }),
  rename: descriptorFor<'rename'>()({
    valid: (args) => stringValue(args.path) && nonEmptyString(args.name)
      && (args.overwrite === undefined || typeof args.overwrite === 'boolean'),
    decode: (args) => ({
      path: args.path as string, name: args.name as string,
      ...(args.overwrite !== undefined && { overwrite: args.overwrite as boolean }),
    }),
    paths: namedPath, refusal: refusedItem,
    decodeResult: resultDecoders.rename,
    run: (context, args) => context.filesystem.rename(context.root, args.path, args.name, args.overwrite),
  }),
  paste: descriptorFor<'paste'>()({
    valid: (args) => stringArray(args.sources) && stringValue(args.destination)
      && (args.mode === 'copy' || args.mode === 'cut') && policy(args.policy),
    decode: (args) => ({
      sources: args.sources as string[], destination: args.destination as string,
      mode: args.mode as 'copy' | 'cut', ...optionalPolicy(args.policy),
    }),
    paths: (args) => [...args.sources, args.destination],
    rootDestination: true, refusal: refusedPaste,
    decodeResult: resultDecoders.paste,
    run: (context, args) => context.filesystem.paste(
      context.root, context.pasteSources(args), args.destination, args.mode, args.policy,
    ),
  }),
  'create-file': descriptorFor<'create-file'>()({
    valid: (args) => stringValue(args.destination),
    decode: destinationOnly, paths: namedDestination,
    rootDestination: true, refusal: refusedItem,
    decodeResult: resultDecoders['create-file'],
    run: (context, args) => context.filesystem.createFile(context.root, args.destination),
  }),
  'create-directory': descriptorFor<'create-directory'>()({
    valid: (args) => stringValue(args.destination),
    decode: destinationOnly, paths: namedDestination,
    rootDestination: true, refusal: refusedItem,
    decodeResult: resultDecoders['create-directory'],
    run: (context, args) => context.filesystem.createDirectory(context.root, args.destination),
  }),
  // Commits and pushes the named paths, or the navigator's own root for an empty list — its
  // workspace-relative prefix travels as `root`, since the far side's single shared workspace root
  // cannot otherwise tell one navigator's root from another's. Its result is a summary string with
  // nowhere to put a reason, so — like `read-file` — it names no refusal shape and a contained-path
  // refusal comes back as an error instead. `rootDestination` is required, not cosmetic: a navigator
  // rooted at the workspace itself derives an *empty* prefix, and that must read as the root itself
  // rather than as an escaping path.
  'git-commit': descriptorFor<'git-commit'>()({
    valid: (args) => nonEmptyString(args.message) && stringArray(args.paths)
      && (args.root === undefined || stringValue(args.root)),
    decode: (args) => ({
      message: args.message as string, paths: args.paths as string[], ...optionalRoot(args.root),
    }),
    paths: (args) => [...args.paths, ...(args.root === undefined ? [] : [args.root])],
    rootDestination: true,
    decodeResult: resultDecoders['git-commit'],
    run: (context, args) => {
      const root = args.paths.length === 0 && args.root ? path.join(context.root, args.root) : context.root;
      return context.filesystem.commit(root, args.message, args.paths);
    },
  }),
  replay: descriptorFor<'replay'>()({
    valid: (args) => history(args.undoStack) && history(args.redoStack)
      && (args.direction === 'undo' || args.direction === 'redo')
      && typeof args.overwrite === 'boolean' && typeof args.skipConflicts === 'boolean',
    decode: (args) => ({
      undoStack: args.undoStack as HistoryStep[], redoStack: args.redoStack as HistoryStep[],
      direction: args.direction as 'undo' | 'redo', overwrite: args.overwrite as boolean,
      skipConflicts: args.skipConflicts as boolean,
    }),
    paths: (args: { undoStack: HistoryStep[]; redoStack: HistoryStep[] }) => historyPaths([...args.undoStack, ...args.redoStack]),
    refusal: refusedReplay,
    decodeResult: resultDecoders.replay,
    run: (context, args) => context.filesystem.replay(
      context.root, args.undoStack, args.redoStack,
      args.direction, args.overwrite, args.skipConflicts,
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the constraint only loosens this satisfies check's variance; each entry keeps its own decoded type in `typeof FILESYSTEM_OPERATIONS`.
} as const satisfies Record<string, OperationDescriptor<any>>;

// One entry per operation: its argument validator, its decoder, its path extractor, how a refusal is
// answered, and what it dispatches to. The `satisfies` is the guarantee — adding a member to
// `RemoteFilesystemOperation` without an entry here fails the build, and every consumer reads this
// table rather than restating the list of operations for itself.
export const FILESYSTEM_OPERATIONS = {
  ...READ_OPERATIONS,
  ...MUTATION_OPERATIONS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the constraint only loosens this satisfies check's variance; each entry keeps its own decoded type in `typeof FILESYSTEM_OPERATIONS`.
} satisfies Record<RemoteFilesystemOperation, OperationDescriptor<any>>;

export function isFilesystemOperation(value: unknown): value is RemoteFilesystemOperation {
  return typeof value === 'string' && Object.hasOwn(FILESYSTEM_OPERATIONS, value);
}

export function operationDescriptor<K extends RemoteFilesystemOperation>(
  operation: K,
): (typeof FILESYSTEM_OPERATIONS)[K] {
  return FILESYSTEM_OPERATIONS[operation];
}

export type RemoteFilesystemOperationResult<K extends RemoteFilesystemOperation> =
  ReturnType<(typeof FILESYSTEM_OPERATIONS)[K]['decodeResult']>;

export function decodeFilesystemResult<K extends RemoteFilesystemOperation>(
  operation: K, value: unknown,
): RemoteFilesystemOperationResult<K> {
  return FILESYSTEM_OPERATIONS[operation].decodeResult(value) as RemoteFilesystemOperationResult<K>;
}
