// The contract an editor save uses to prove its buffer was built on what is on disk now. The client
// sends a fingerprint of the text its buffer was last loaded from or saved as; the server compares
// that with the file it is about to replace and refuses with `SAVE_CONFLICT_ERROR` when they differ,
// so a buffer that never saw a change landing on disk cannot write over it. Shared by both sides,
// so the two fingerprints are computed by the same function and the refusal is matched exactly.

export const SAVE_CONFLICT_ERROR = 'This file changed on disk since it was loaded';

// A 53-bit non-cryptographic fingerprint read at every UTF-16 index of the text, prefixed with its
// length. It detects change, not tampering: both sides are the same local user, so a collision
// would have to arise by chance, and it runs synchronously in the browser where SubtleCrypto
// would force every save through an extra async step.
export function contentHash(text: string): string {
  let h1 = 0xde_ad_be_ef ^ text.length;
  let h2 = 0x41_c6_ce_57 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.codePointAt(index) ?? 0;
    h1 = Math.imul(h1 ^ code, 2_654_435_761);
    h2 = Math.imul(h2 ^ code, 1_597_334_677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507) ^ Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0');
  return `${text.length.toString(36)}-${hex(h2 & 0x1f_ff_ff)}${hex(h1)}`;
}
