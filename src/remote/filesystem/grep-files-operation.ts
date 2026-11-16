import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { decodeFileGrepArgs, validFileGrepArgs } from './grep-files-arguments.js';
import { grepWorkspace } from '../../file-grep/grep.js';
import type { FileGrepArgs } from '../../file-grep/command.js';
import { GREP_TIMEOUT_MS } from '../../file-grep/scan.js';

export const grepFilesOperation = descriptorFor<'grep-files'>()({
  valid: validFileGrepArgs,
  decode: decodeFileGrepArgs,
  paths: (args) => (args.path === undefined ? [] : [args.path]),
  rootDestination: true,
  decodeResult: resultDecoders['grep-files'],
  run: async (context, args) => {
    const workspaceArgs: FileGrepArgs = {
      pattern: args.pattern,
      include: args.include,
      exclude: args.exclude,
      literal: args.literal,
      word: args.word,
      caseSensitive: args.caseSensitive,
      limit: args.limit,
      path: args.path,
    };
    return { text: await grepWorkspace(context.root, workspaceArgs, Date.now() + GREP_TIMEOUT_MS) };
  },
});
