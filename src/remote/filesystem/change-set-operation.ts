import { isDiffSource, type DiffSource } from '../../plugins/diff/shared.js';
import { requireStringArray, stringArray } from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';

// Reads the far side's workspace changes for a remote diff tab: which files to expand to their whole
// contents, and which changes to read — all of them, the staged ones, or the most recent commit's.
// No path arguments name anything to contain; the read is scoped to the far side's own root.
function requireDiffSource(value: unknown): DiffSource {
  if (!isDiffSource(value)) throw new Error('Invalid remote filesystem operation arguments.');
  return value;
}

export const changeSetOperation = descriptorFor<'change-set'>()({
  valid: (args) => stringArray(args.fullFiles) && isDiffSource(args.source),
  decode: (args) => ({ fullFiles: requireStringArray(args.fullFiles), source: requireDiffSource(args.source) }),
  paths: () => [],
  decodeResult: resultDecoders['change-set'],
  run: (context, args) => context.filesystem.changeSet(context.root, args.fullFiles, args.source),
});
