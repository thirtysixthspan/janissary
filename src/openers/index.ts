import type { Opener } from './types.js';
import { opener as image } from './image.js';

// The opener registry. The `open` dispatcher walks this list in order and picks the first opener
// whose `extensions` include the target file's extension. Supporting a new file type is additive:
// add one opener module and one entry here — the dispatcher is never touched.
export const openers: Opener[] = [
  image,
];

// Find the opener registered for a file extension (lowercased, dot-prefixed), or undefined.
export function openerForExtension(ext: string): Opener | undefined {
  const e = ext.toLowerCase();
  return openers.find((o) => o.extensions.includes(e));
}

export type { Opener, OpenContext } from './types.js';
