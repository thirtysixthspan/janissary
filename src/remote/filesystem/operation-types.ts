import type { FileSystemPort, GitMetadata } from '../../file-navigator/filesystem-port.js';
import type { MaybePromise } from '../../maybe-promise.js';
import type { RemoteFilesystemArguments } from '../protocol-frames.js';

export type OperationContext = {
  root: string;
  filesystem: FileSystemPort;
  watch: (relPath: string) => MaybePromise<Record<string, never>>;
  unwatch: (relPath: string) => Record<string, never>;
  git: () => Promise<GitMetadata>;
  readFile: (relPath: string) => Promise<{ content: string }>;
  pasteSources: (args: RemoteFilesystemArguments) => string[];
};

export type OperationDescriptor<A = RemoteFilesystemArguments, R = unknown> = {
  valid: (args: Record<string, unknown>) => boolean;
  decode: (args: Record<string, unknown>) => A;
  paths: (args: A) => string[];
  rootDestination?: true;
  refusal?: (args: A, attempted: string[], reason: string) => unknown;
  decodeResult: (value: unknown) => R;
  run: (context: OperationContext, args: A) => MaybePromise<R>;
};

export function descriptorFor<A, R>(descriptor: OperationDescriptor<A, R>): OperationDescriptor<A, R> {
  return descriptor;
}
