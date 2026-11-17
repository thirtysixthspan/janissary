import { decodeBase64Text, requireBase64Text } from './argument-checks.js';
import { descriptorFor } from './operation-types.js';
import { resultDecoders } from './result-decoders.js';
import { applyPatchText } from '../../file-patch/apply.js';

export const applyPatchOperation = descriptorFor<'apply-patch'>()({
  valid: (args) => Object.keys(args).length === 1 && decodeBase64Text(args.patchText) !== undefined,
  decode: (args) => ({ patchText: requireBase64Text(args.patchText) }),
  paths: () => [],
  decodeResult: resultDecoders['apply-patch'],
  run: (context, args) => ({ text: applyPatchText(context.root, args.patchText) }),
});
