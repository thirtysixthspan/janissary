import type { FileSystemPort, GitMetadata } from '../../file-navigator/filesystem-port.js';
import type { MaybePromise } from '../../maybe-promise.js';
import type { RemoteFilesystemArgumentsByOperation, RemoteFilesystemOperation } from '../protocol-frames.js';

export type OperationContext = {
  root: string;
  filesystem: FileSystemPort;
  watch: (relPath: string) => MaybePromise<Record<string, never>>;
  unwatch: (relPath: string) => Record<string, never>;
  git: () => Promise<GitMetadata>;
  readFile: (relPath: string) => Promise<{ content: string }>;
  pasteSources: (args: RemoteFilesystemArgumentsByOperation['paste']) => string[];
};

export type OperationDescriptor<A = RemoteFilesystemArgumentsByOperation[RemoteFilesystemOperation], R = unknown> = {
  valid: (args: Record<string, unknown>) => boolean;
  decode: (args: Record<string, unknown>) => A;
  paths: (args: A) => string[];
  rootDestination?: true;
  refusal?: (args: A, attempted: string[], reason: string) => unknown;
  decodeResult: (value: unknown) => R;
  run: (context: OperationContext, args: A) => MaybePromise<R>;
};

// The table checks descriptor shape while preserving each entry's concrete arguments and result.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the descriptor callbacks are contravariant in their decoded arguments.
export type AnyOperationDescriptor = OperationDescriptor<any>;

export function descriptorFor<K extends RemoteFilesystemOperation>() {
  return function <R>(
    descriptor: OperationDescriptor<RemoteFilesystemArgumentsByOperation[K], R>,
  ): OperationDescriptor<RemoteFilesystemArgumentsByOperation[K], R> {
    return descriptor;
  };
}
