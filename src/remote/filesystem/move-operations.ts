import { optionalPolicy, policy, requireBoolean, requireString, requireStringArray, stringArray, stringValue } from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { refusedItem, refusedMoveMany } from './refusal-shapes.js';
import { resultDecoders } from './result-decoders.js';

export const moveOperation = descriptorFor<'move'>()({
  valid: (args) => stringValue(args.from) && stringValue(args.to)
    && (args.overwrite === undefined || typeof args.overwrite === 'boolean'),
  decode: (args) => ({
    from: requireString(args.from), to: requireString(args.to),
    ...(args.overwrite !== undefined && { overwrite: requireBoolean(args.overwrite) }),
  }),
  paths: (args) => [args.from, args.to],
  rootDestination: true, refusal: refusedItem,
  decodeResult: resultDecoders.move,
  run: (context, args) => context.filesystem.move(context.root, args.from, args.to, args.overwrite),
});

export const moveManyOperation = descriptorFor<'move-many'>()({
  valid: (args) => stringArray(args.sources) && stringValue(args.destination) && policy(args.policy),
  decode: (args) => ({
    sources: requireStringArray(args.sources), destination: requireString(args.destination),
    ...optionalPolicy(args.policy),
  }),
  paths: (args) => [...args.sources, args.destination],
  rootDestination: true, refusal: refusedMoveMany,
  decodeResult: resultDecoders['move-many'],
  run: (context, args) => context.filesystem.moveMany(
    context.root, args.sources, args.destination, args.policy,
  ),
});
